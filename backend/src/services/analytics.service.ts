import prisma from '../utils/prisma';
import { DashboardMetrics } from '../types/analytics';

export class AnalyticsService {
  // Get dashboard metrics
  static async getDashboardMetrics(days: number = 30): Promise<DashboardMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Attendance stats
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        date: {
          gte: startDate,
        },
      },
    });

    const totalAttendance = attendanceRecords.reduce((sum, r) => sum + r.count, 0);
    const averageDaily = totalAttendance / days;

    // Calculate trend
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - Math.floor(days / 2));

    const firstHalf = attendanceRecords
      .filter((r) => r.date >= startDate && r.date <= midDate)
      .reduce((sum, r) => sum + r.count, 0);
    const secondHalf = attendanceRecords
      .filter((r) => r.date > midDate)
      .reduce((sum, r) => sum + r.count, 0);

    const changePercent = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
    const trend = changePercent > 2 ? 'UP' : changePercent < -2 ? 'DOWN' : 'STABLE';

    // Waste stats
    const wasteRecords = await prisma.wasteRecord.findMany({
      where: {
        date: {
          gte: startDate,
        },
      },
    });

    const totalWaste = wasteRecords.reduce((sum, r) => sum + r.quantityWasted, 0);
    const totalPrepared = wasteRecords.reduce((sum, r) => sum + (r.quantityPrepared || 0), 0);
    const wastePercentage = totalPrepared > 0 ? (totalWaste / totalPrepared) * 100 : 0;

    // Inventory stats
    const allItems = await prisma.inventoryItem.findMany();
    const lowStockItems = allItems.filter((i) => i.quantity < i.minThreshold).length;
    const expiringItems = allItems.filter((i) => {
      if (!i.expiryDate) return false;
      const daysUntil = Math.ceil(
        (i.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysUntil >= 0 && daysUntil < 7;
    }).length;

    // Get latest predictions
    const latestPredictions = await prisma.prediction.findMany({
      where: {
        predictionType: 'ATTENDANCE',
      },
      orderBy: { predictionDate: 'desc' },
      take: 1,
    });

    return {
      attendance: {
        totalAttendance,
        averageDaily,
        trend,
        changePercent,
      },
      waste: {
        total: totalWaste,
        percentage: wastePercentage,
        trend: changePercent > 2 ? 'UP' : changePercent < -2 ? 'DOWN' : 'STABLE',
      },
      inventory: {
        totalItems: allItems.length,
        lowStock: lowStockItems,
        expiring: expiringItems,
      },
      predictions: latestPredictions.length > 0 ? {
        nextAttendance: latestPredictions[0].predictedValue,
        nextDemand: 0,
        confidence: latestPredictions[0].confidence,
      } : undefined,
    };
  }

  // Get monthly analytics
  static async getMonthlyAnalytics(year: number, month: number) {
    return await prisma.monthlySummary.findUnique({
      where: {
        year_month: {
          year,
          month,
        },
      },
    });
  }

  // Get trend data for charts
  static async getTrendData(metric: 'attendance' | 'waste', days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    if (metric === 'attendance') {
      const records = await prisma.attendanceRecord.findMany({
        where: {
          date: {
            gte: startDate,
          },
        },
        orderBy: { date: 'asc' },
      });

      // one point per day (sum of all meals)
      const byDay = new Map<string, number>();
      records.forEach((r) => {
        const d = r.date.toISOString().split('T')[0];
        byDay.set(d, (byDay.get(d) || 0) + r.count);
      });
      return Array.from(byDay, ([date, value]) => ({ date, value }));
    } else {
      const summaries = await prisma.dailySummary.findMany({
        where: {
          date: {
            gte: startDate,
          },
        },
        orderBy: { date: 'asc' },
      });

      return summaries.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        value: parseFloat(s.totalWaste.toFixed(2)),
        percentage: parseFloat(s.wastePercentage.toFixed(2)),
      }));
    }
  }

  // Get KPI cards data
  static async getKPIData() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAttendance = await prisma.attendanceRecord.aggregate({
      where: {
        date: {
          gte: today,
        },
      },
      _sum: { count: true },
    });

    const todayWaste = await prisma.wasteRecord.aggregate({
      where: {
        date: {
          gte: today,
        },
      },
      _sum: { quantityWasted: true },
    });

    const thisMonth = new Date();
    thisMonth.setDate(1);

    const monthlyWaste = await prisma.wasteRecord.aggregate({
      where: {
        date: {
          gte: thisMonth,
        },
      },
      _sum: { quantityWasted: true },
    });

    const monthlyAttendance = await prisma.attendanceRecord.aggregate({
      where: {
        date: {
          gte: thisMonth,
        },
      },
      _sum: { count: true },
    });

    return {
      todayAttendance: todayAttendance._sum.count || 0,
      todayWaste: todayWaste._sum.quantityWasted || 0,
      monthlyAttendance: monthlyAttendance._sum.count || 0,
      monthlyWaste: monthlyWaste._sum.quantityWasted || 0,
    };
  }
}