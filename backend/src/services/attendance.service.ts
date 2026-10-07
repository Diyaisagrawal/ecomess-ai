import prisma from '../utils/prisma';

export class AttendanceService {
  static async createAttendanceRecord(
    date: string,
    count: number,
    mealType: string = 'LUNCH',
    notes?: string,
    userId: number = 1
  ) {
    const dateObj = new Date(date);

    const existing = await prisma.attendanceRecord.findFirst({
      where: {
        date: {
          gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
          lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
        },
        mealType,
      },
    });

    if (existing) {
      return await prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: { count, notes },
      });
    }

    const record = await prisma.attendanceRecord.create({
      data: {
        date: dateObj,
        count,
        mealType,
        notes,
        userId,
      },
    });

    return record;
  }

  static async getAttendanceRecords(
    startDate?: string,
    endDate?: string,
    mealType?: string,
    page: number = 1,
    limit: number = 20
  ) {
    const where: any = {};

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    if (mealType) where.mealType = mealType;

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.attendanceRecord.count({ where });

    return {
      records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  static async getAttendanceStats(startDate: string, endDate: string) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'asc' },
    });

    const totalAttendance = records.reduce((sum, r) => sum + r.count, 0);
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const averageDaily = totalAttendance / days;

    const midDate = new Date();
    midDate.setDate(midDate.getDate() - Math.floor(days / 2));

    const firstHalf = records
      .filter((r) => r.date <= midDate)
      .reduce((sum, r) => sum + r.count, 0);
    const secondHalf = records
      .filter((r) => r.date > midDate)
      .reduce((sum, r) => sum + r.count, 0);

    const changePercent = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

    const byMealType: Record<string, number> = {};
    records.forEach((r) => {
      byMealType[r.mealType] = (byMealType[r.mealType] || 0) + r.count;
    });

    return {
      totalAttendance,
      averageDaily: Math.round(averageDaily),
      changePercent: Math.round(changePercent * 100) / 100,
      trend: changePercent > 2 ? 'UP' : changePercent < -2 ? 'DOWN' : 'STABLE',
      byMealType,
    };
  }

  static async updateAttendanceRecord(
    id: number,
    data: { count?: number; notes?: string; mealType?: string }
  ) {
    return await prisma.attendanceRecord.update({
      where: { id },
      data: {
        count: data.count,
        notes: data.notes,
        mealType: data.mealType,
      },
    });
  }

  static async deleteAttendanceRecord(id: number) {
    await prisma.attendanceRecord.delete({ where: { id } });
  }

  static async getDailySummary(date: string) {
    const dateObj = new Date(date);
    return await prisma.dailySummary.findUnique({
      where: { date: dateObj },
    });
  }

  static async getMonthlySummary(year: number, month: number) {
    return await prisma.monthlySummary.findUnique({
      where: { year_month: { year, month } },
    });
  }

  static async generateMonthlySummary(year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const dailySummaries = await prisma.dailySummary.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
    });

    const totalAttendance = dailySummaries.reduce((sum, s) => sum + s.totalAttendance, 0);
    const totalWaste = dailySummaries.reduce((sum, s) => sum + s.totalWaste, 0);
    const averageDailyWaste = dailySummaries.length > 0 ? totalWaste / dailySummaries.length : 0;
    const wastePercentage =
      dailySummaries.length > 0
        ? dailySummaries.reduce((sum, s) => sum + s.wastePercentage, 0) / dailySummaries.length
        : 0;

    return await prisma.monthlySummary.upsert({
      where: { year_month: { year, month } },
      create: {
        year,
        month,
        totalAttendance,
        totalWaste,
        averageDailyWaste,
        wastePercentage,
        costSavings: 0,
      },
      update: {
        totalAttendance,
        totalWaste,
        averageDailyWaste,
        wastePercentage,
      },
    });
  }

  static async getTrendData(metric: 'attendance' | 'waste', days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const summaries = await prisma.dailySummary.findMany({
      where: { date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    if (metric === 'attendance') {
      return summaries.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        value: s.totalAttendance,
      }));
    } else {
      return summaries.map((s) => ({
        date: s.date.toISOString().split('T')[0],
        value: parseFloat(s.totalWaste.toFixed(2)),
      }));
    }
  }
}