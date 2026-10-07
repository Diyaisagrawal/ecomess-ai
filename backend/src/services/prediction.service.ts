import axios, { AxiosError } from 'axios';
import prisma from '../utils/prisma';
import { env } from '../config/env';

type PredictionType = 'ATTENDANCE' | 'DEMAND' | 'WASTE';

// Free-tier ML hosts cold-start slowly, so allow a generous timeout.
const ml = axios.create({
  baseURL: env.mlServiceUrl,
  timeout: 60_000,
  headers: env.mlApiKey ? { 'X-API-Key': env.mlApiKey } : {},
});

function mlError(error: unknown, fallback: string): Error {
  const err = error as AxiosError<{ detail?: string }>;
  if (err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED' || err.code === 'ENOTFOUND') {
    return Object.assign(new Error('ML service is unavailable (it may be waking up — retry in ~30s)'), {
      status: 503,
    });
  }
  const detail = err.response?.data?.detail;
  console.error('ML service error:', err.message, detail ?? '');
  return Object.assign(new Error(detail || fallback), { status: err.response?.status || 502 });
}

const toDay = (d: string | Date) => {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export class PredictionService {
  /** Upsert so repeated forecasts for the same day/meal/type don't pile up. */
  static async savePrediction(data: {
    predictionDate: string | Date;
    mealType: string;
    predictionType: PredictionType;
    predictedValue: number;
    confidence?: number;
    modelVersion?: string;
  }) {
    const predictionDate = toDay(data.predictionDate);
    const existing = await prisma.prediction.findFirst({
      where: { predictionDate, mealType: data.mealType, predictionType: data.predictionType },
    });
    const payload = {
      predictedValue: data.predictedValue,
      confidence: data.confidence ?? 0,
      modelVersion: data.modelVersion ?? '1.0',
    };
    if (existing) {
      return prisma.prediction.update({ where: { id: existing.id }, data: payload });
    }
    return prisma.prediction.create({
      data: { predictionDate, mealType: data.mealType, predictionType: data.predictionType, ...payload },
    });
  }

  static async getPredictions(type?: string, startDate?: string, endDate?: string, limit = 50) {
    const where: any = {};
    if (type) where.predictionType = type;
    if (startDate && endDate) {
      where.predictionDate = { gte: new Date(startDate), lte: new Date(endDate) };
    }
    return prisma.prediction.findMany({ where, orderBy: { predictionDate: 'desc' }, take: limit });
  }

  static async updatePredictionActual(id: number, actualValue: number) {
    return prisma.prediction.update({ where: { id }, data: { actualValue } });
  }

  static async predictAttendance(date: string, mealType = 'LUNCH') {
    try {
      const { data } = await ml.post('/predict/attendance', { date, mealType });
      await this.savePrediction({
        predictionDate: date,
        mealType,
        predictionType: 'ATTENDANCE',
        predictedValue: data.predicted_value,
        confidence: data.confidence,
        modelVersion: data.model_version,
      });
      return {
        predictedAttendance: data.predicted_value,
        interval: data.interval,
        confidence: data.confidence,
        modelVersion: data.model_version,
        dataSource: data.data_source,
      };
    } catch (error) {
      throw mlError(error, 'Failed to get attendance prediction');
    }
  }

  static async predictDemand(date: string, mealType = 'LUNCH') {
    try {
      const { data } = await ml.post('/predict/demand', { date, mealType });
      await this.savePrediction({
        predictionDate: date,
        mealType,
        predictionType: 'DEMAND',
        predictedValue: data.predicted_demand,
        confidence: data.confidence,
        modelVersion: data.model_version,
      });
      return {
        predictedDemand: data.predicted_demand,
        recommendedPrepKg: data.recommended_prep_kg,
        predictedAttendance: data.predicted_attendance,
        confidence: data.confidence,
        unit: 'kg',
      };
    } catch (error) {
      throw mlError(error, 'Failed to get demand prediction');
    }
  }

  static async predictWaste(date: string, mealType = 'LUNCH') {
    try {
      const { data } = await ml.post('/predict/waste', { date, mealType });
      await this.savePrediction({
        predictionDate: date,
        mealType,
        predictionType: 'WASTE',
        predictedValue: data.predicted_waste,
        confidence: data.confidence,
        modelVersion: data.model_version,
      });
      return { predictedWaste: data.predicted_waste, confidence: data.confidence, unit: 'kg' };
    } catch (error) {
      throw mlError(error, 'Failed to get waste prediction');
    }
  }

  /** Live 7-day forecast from the ML service; each day is also stored for accuracy tracking. */
  static async get7DayForecast(mealType = 'LUNCH') {
    const start = toDay(new Date());
    start.setUTCDate(start.getUTCDate() + 1);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    let data: any;
    try {
      ({ data } = await ml.post('/predict/batch', {
        start_date: isoDay(start),
        end_date: isoDay(end),
        meal_type: mealType,
      }));
    } catch (error) {
      throw mlError(error, 'Failed to get forecast');
    }

    await Promise.all(
      data.days.flatMap((d: any) => [
        this.savePrediction({ predictionDate: d.date, mealType, predictionType: 'ATTENDANCE', predictedValue: d.attendance, confidence: d.attendance_confidence, modelVersion: data.model_version }),
        this.savePrediction({ predictionDate: d.date, mealType, predictionType: 'DEMAND', predictedValue: d.demand_kg, confidence: d.demand_confidence, modelVersion: data.model_version }),
        this.savePrediction({ predictionDate: d.date, mealType, predictionType: 'WASTE', predictedValue: d.waste_kg, confidence: d.waste_confidence, modelVersion: data.model_version }),
      ])
    );

    return {
      mealType,
      modelVersion: data.model_version,
      dataSource: data.data_source,
      days: data.days.map((d: any) => ({
        date: d.date,
        attendance: d.attendance,
        attendanceLow: d.attendance_interval[0],
        attendanceHigh: d.attendance_interval[1],
        demandKg: d.demand_kg,
        recommendedPrepKg: d.recommended_prep_kg,
        wasteKg: d.waste_kg,
        confidence: d.attendance_confidence,
      })),
    };
  }

  /**
   * Accuracy of past forecasts vs what actually happened. Actuals are filled
   * lazily from attendance / waste records so no manual step is needed.
   */
  static async getModelAccuracy(type: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const today = toDay(new Date());

    const pending = await prisma.prediction.findMany({
      where: { predictionType: type, actualValue: null, predictionDate: { gte: since, lt: today } },
    });
    for (const p of pending) {
      const dayStart = toDay(p.predictionDate);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const range = { gte: dayStart, lt: dayEnd };
      let actual: number | null = null;
      if (type === 'ATTENDANCE') {
        const r = await prisma.attendanceRecord.aggregate({ where: { date: range, mealType: p.mealType }, _sum: { count: true } });
        actual = r._sum.count;
      } else {
        const r = await prisma.wasteRecord.aggregate({
          where: { date: range, mealType: p.mealType },
          _sum: { quantityWasted: true, quantityPrepared: true },
        });
        actual = type === 'WASTE'
          ? r._sum.quantityWasted
          : r._sum.quantityPrepared != null && r._sum.quantityWasted != null
            ? r._sum.quantityPrepared - r._sum.quantityWasted
            : null;
      }
      if (actual != null) {
        await prisma.prediction.update({ where: { id: p.id }, data: { actualValue: actual } });
      }
    }

    const predictions = await prisma.prediction.findMany({
      where: { predictionType: type, actualValue: { not: null }, predictionDate: { gte: since } },
    });
    if (predictions.length === 0) {
      return { type, predictionsWithActuals: 0, mae: null, rmse: null, mape: null };
    }

    let abs = 0, sq = 0, pct = 0, pctN = 0;
    for (const p of predictions) {
      const e = Math.abs(p.predictedValue - (p.actualValue as number));
      abs += e;
      sq += e * e;
      if (p.actualValue) {
        pct += e / Math.abs(p.actualValue);
        pctN++;
      }
    }
    const n = predictions.length;
    const r2 = (x: number) => Math.round(x * 100) / 100;
    return {
      type,
      predictionsWithActuals: n,
      mae: r2(abs / n),
      rmse: r2(Math.sqrt(sq / n)),
      mape: pctN ? r2((pct / pctN) * 100) : null,
    };
  }

  static async triggerTraining() {
    try {
      const { data } = await ml.post('/train/trigger', {});
      return data;
    } catch (error) {
      throw mlError(error, 'Failed to trigger training');
    }
  }

  static async getTrainingStatus(jobId: string) {
    try {
      const { data } = await ml.get(`/train/status/${encodeURIComponent(jobId)}`);
      return data;
    } catch (error) {
      throw mlError(error, 'Failed to get training status');
    }
  }

  static async getModels() {
    try {
      const { data } = await ml.get('/models');
      return data;
    } catch (error) {
      throw mlError(error, 'Failed to get models');
    }
  }

  static async getModelMetrics(modelName: string) {
    try {
      const { data } = await ml.get(`/models/${encodeURIComponent(modelName)}/metrics`);
      return data;
    } catch (error) {
      throw mlError(error, 'Failed to get model metrics');
    }
  }

  static async getRecommendations() {
    try {
      const { data } = await ml.get('/recommendations');
      return data;
    } catch (error) {
      throw mlError(error, 'Failed to get recommendations');
    }
  }
}
