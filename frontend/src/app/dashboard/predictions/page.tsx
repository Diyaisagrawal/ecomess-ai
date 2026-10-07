'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getErrorMessage, predictionAPI } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

type Meal = 'BREAKFAST' | 'LUNCH' | 'DINNER';

interface ForecastDay {
  date: string;
  attendance: number;
  attendanceLow: number;
  attendanceHigh: number;
  demandKg: number;
  recommendedPrepKg: number;
  wasteKg: number;
  confidence: number;
}

interface ModelInfo {
  name: string;
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  accuracy: number;
  train_rows: number;
  test_rows: number;
  top_features: Record<string, number>;
}

const MODEL_LABELS: Record<string, string> = {
  attendance_predictor: 'Attendance',
  demand_predictor: 'Food demand',
  waste_predictor: 'Food waste',
};

const PRIORITY_STYLE: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-gray-100 text-gray-700',
};

const weekday = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

export default function PredictionsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canTrain = role === 'ADMIN' || role === 'MANAGER';

  const [meal, setMeal] = useState<Meal>('LUNCH');
  const [forecast, setForecast] = useState<{ days: ForecastDay[]; dataSource: string; modelVersion: string } | null>(null);
  const [models, setModels] = useState<{ models: ModelInfo[]; rows: number; date_range: string[]; trained_at: string } | null>(null);
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [training, setTraining] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadModels = useCallback(async () => {
    const [m, r] = await Promise.all([predictionAPI.models(), predictionAPI.recommendations()]);
    setModels(m.data.data);
    setRecs(r.data.data.recommendations);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    predictionAPI
      .forecastWeek(meal)
      .then((res) => !cancelled && setForecast(res.data.data))
      .catch((e) => !cancelled && setError(getErrorMessage(e, 'Could not load forecast')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [meal]);

  useEffect(() => {
    loadModels().catch((e) => setError(getErrorMessage(e, 'Could not load model info')));
    return () => {
      if (poll.current) clearInterval(poll.current);
    };
  }, [loadModels]);

  const retrain = async () => {
    try {
      setTraining('Starting…');
      const { data } = await predictionAPI.trainTrigger();
      const jobId = data.data.job_id;
      poll.current = setInterval(async () => {
        try {
          const s = (await predictionAPI.trainStatus(jobId)).data.data;
          if (s.status === 'completed' || s.status === 'failed') {
            if (poll.current) clearInterval(poll.current);
            setTraining(s.status === 'completed' ? `Retrained on ${s.rows} rows ✓` : `Training failed: ${s.error}`);
            await loadModels();
            const f = await predictionAPI.forecastWeek(meal);
            setForecast(f.data.data);
            setTimeout(() => setTraining(null), 4000);
          } else {
            setTraining(`Training… (${s.status})`);
          }
        } catch (e) {
          if (poll.current) clearInterval(poll.current);
          setTraining(getErrorMessage(e));
        }
      }, 1500);
    } catch (e) {
      setTraining(getErrorMessage(e, 'Could not start training'));
    }
  };

  const chartData = forecast?.days.map((d) => ({
    ...d,
    label: weekday(d.date),
    range: [d.attendanceLow, d.attendanceHigh],
  }));
  const totals = forecast?.days.reduce(
    (a, d) => ({ prep: a.prep + d.recommendedPrepKg, waste: a.waste + d.wasteKg, people: a.people + d.attendance }),
    { prep: 0, waste: 0, people: 0 }
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">AI Forecasts</h1>
          <p className="text-gray-600 mt-2">
            XGBoost models trained on your attendance and waste history
            {forecast && (
              <span className="ml-2 text-xs rounded bg-gray-200 px-2 py-0.5 text-gray-700">
                model v{forecast.modelVersion} · {forecast.dataSource === 'database' ? 'trained on your data' : 'bootstrapped on synthetic data'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
            {(['BREAKFAST', 'LUNCH', 'DINNER'] as Meal[]).map((m) => (
              <button
                key={m}
                onClick={() => setMeal(m)}
                className={`px-3 py-1.5 text-sm rounded-md ${meal === m ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                {m.charAt(0) + m.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {canTrain && (
            <button
              onClick={retrain}
              disabled={!!training && training.startsWith('Train')}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Retrain models
            </button>
          )}
        </div>
      </div>

      {training && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{training}</div>}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}

      {totals && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Expected diners, next 7 days</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">{totals.people.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Recommended to prepare</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">{totals.prep.toFixed(0)} kg</p>
            <p className="text-xs text-gray-500 mt-1">forecast demand + 5% buffer</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-500">Waste expected at current habits</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">{totals.waste.toFixed(0)} kg</p>
            <p className="text-xs text-gray-500 mt-1">what preparing to forecast can avoid</p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold text-gray-900 mb-4">7-day forecast · {meal.toLowerCase()}</h2>
        {loading ? (
          <div className="h-[340px] flex items-center justify-center text-gray-500">
            Loading forecast… (the free-tier ML service can take ~30s to wake up)
          </div>
        ) : chartData ? (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis yAxisId="people" label={{ value: 'diners', angle: -90, position: 'insideLeft' }} />
              <YAxis yAxisId="kg" orientation="right" label={{ value: 'kg', angle: 90, position: 'insideRight' }} />
              <Tooltip />
              <Legend />
              <Area yAxisId="people" dataKey="range" name="Attendance 95% range" fill="#bfdbfe" stroke="none" />
              <Line yAxisId="people" dataKey="attendance" name="Attendance" stroke="#2563eb" strokeWidth={2} />
              <Bar yAxisId="kg" dataKey="recommendedPrepKg" name="Prepare (kg)" fill="#16a34a" barSize={18} />
              <Bar yAxisId="kg" dataKey="wasteKg" name="Expected waste (kg)" fill="#f97316" barSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}

        {forecast && (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Day</th>
                  <th className="py-2 pr-4">Diners</th>
                  <th className="py-2 pr-4">Range</th>
                  <th className="py-2 pr-4">Demand</th>
                  <th className="py-2 pr-4">Prepare</th>
                  <th className="py-2 pr-4">Waste risk</th>
                </tr>
              </thead>
              <tbody>
                {forecast.days.map((d) => (
                  <tr key={d.date} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{weekday(d.date)}</td>
                    <td className="py-2 pr-4">{d.attendance}</td>
                    <td className="py-2 pr-4 text-gray-500">{d.attendanceLow}–{d.attendanceHigh}</td>
                    <td className="py-2 pr-4">{d.demandKg.toFixed(1)} kg</td>
                    <td className="py-2 pr-4 font-semibold text-green-700">{d.recommendedPrepKg.toFixed(1)} kg</td>
                    <td className="py-2 pr-4 text-orange-600">{d.wasteKg.toFixed(1)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Model performance</h2>
          {models && (
            <p className="text-xs text-gray-500 mb-4">
              Hold-out = last 20% of days · trained on {models.rows} rows ({models.date_range[0]} → {models.date_range[1]})
            </p>
          )}
          <div className="space-y-4">
            {models?.models.map((m) => (
              <div key={m.name} className="border rounded-lg p-4">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-semibold">{MODEL_LABELS[m.name] ?? m.name}</h3>
                  <span className="text-sm text-gray-500">R² {m.r2.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                  <div><span className="text-gray-500">MAE</span> <b>{m.mae.toFixed(1)}</b></div>
                  <div><span className="text-gray-500">RMSE</span> <b>{m.rmse.toFixed(1)}</b></div>
                  <div><span className="text-gray-500">MAPE</span> <b>{m.mape.toFixed(1)}%</b></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Top drivers: {Object.keys(m.top_features).slice(0, 3).map((f) => f.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>
            ))}
            {!models && <p className="text-gray-500 text-sm">Loading…</p>}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recommendations</h2>
          <ul className="space-y-3">
            {recs.map((r, i) => (
              <li key={i} className="border rounded-lg p-4">
                <div className="flex justify-between gap-3">
                  <h3 className="font-semibold text-gray-900">{r.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded h-fit ${PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE.LOW}`}>{r.priority}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{r.description}</p>
              </li>
            ))}
            {recs.length === 0 && <p className="text-gray-500 text-sm">Loading…</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
