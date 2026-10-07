import prisma from '../utils/prisma';
import { WasteRecordDTO, WasteFilter, WasteStats } from '../types/waste';

export class WasteService {
  // Create waste record
  static async createWasteRecord(
    userId: number,
    data: WasteRecordDTO
  ) {
    const wasteRecord = await prisma.wasteRecord.create({
      data: {
        date: new Date(data.date),
        foodItem: data.foodItem,
        category: data.category,
        quantityWasted: data.quantityWasted,
        quantityPrepared: data.quantityPrepared,
        reason: data.reason,
        mealType: data.mealType,
        userId,
      },
    });

    // Update daily summary
    await this.updateDailySummary(data.date, data.mealType);

    return wasteRecord;
  }

  // Get waste records with filters
  static async getWasteRecords(
    userId: number,
    filters: WasteFilter,
    page: number = 1,
    limit: number = 20
  ) {
    const where: any = {};

    if (filters.startDate && filters.endDate) {
      where.date = {
        gte: new Date(filters.startDate),
        lte: new Date(filters.endDate),
      };
    }

    if (filters.category) where.category = filters.category;
    if (filters.foodItem) where.foodItem = filters.foodItem;
    if (filters.mealType) where.mealType = filters.mealType;

    const records = await prisma.wasteRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.wasteRecord.count({ where });

    return {
      records,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Get waste statistics
  static async getWasteStats(startDate: string, endDate: string): Promise<WasteStats> {
    const records = await prisma.wasteRecord.findMany({
      where: {
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
    });

    const totalWaste = records.reduce((sum, r) => sum + r.quantityWasted, 0);
    const days = Math.ceil(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const averageDaily = totalWaste / days;

    // Top wasted items
    const itemMap = new Map<string, number>();
    records.forEach((r) => {
      itemMap.set(r.foodItem, (itemMap.get(r.foodItem) || 0) + r.quantityWasted);
    });

    const topWastedItems = Array.from(itemMap.entries())
      .map(([item, qty]) => ({
        foodItem: item,
        quantity: qty,
        percentage: (qty / totalWaste) * 100,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Waste by category
    const categoryMap = new Map<string, number>();
    records.forEach((r) => {
      categoryMap.set(r.category, (categoryMap.get(r.category) || 0) + r.quantityWasted);
    });

    const wasteByCategory = Array.from(categoryMap.entries()).map(([cat, qty]) => ({
      category: cat,
      quantity: qty,
      percentage: (qty / totalWaste) * 100,
    }));

    return {
      totalWaste,
      averageDaily,
      topWastedItems,
      wasteByCategory,
    };
  }

  // Update or delete
  static async updateWasteRecord(id: number, data: Partial<WasteRecordDTO>) {
    const wasteRecord = await prisma.wasteRecord.update({
      where: { id },
      data: {
        foodItem: data.foodItem,
        category: data.category,
        quantityWasted: data.quantityWasted,
        quantityPrepared: data.quantityPrepared,
        reason: data.reason,
        mealType: data.mealType,
      },
    });
    return wasteRecord;
  }

  static async deleteWasteRecord(id: number) {
    await prisma.wasteRecord.delete({ where: { id } });
  }

  // Update daily summary (helper)
  private static async updateDailySummary(date: string, mealType: string) {
    const dateObj = new Date(date);

    // Get all waste for the date
    const wasteRecords = await prisma.wasteRecord.findMany({
      where: {
        date: {
          gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
          lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
        },
      },
    });

    // Get attendance for the date
    const attendanceRecord = await prisma.attendanceRecord.findFirst({
      where: {
        date: {
          gte: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
          lt: new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() + 1),
        },
      },
    });

    const totalWaste = wasteRecords.reduce((sum, r) => sum + r.quantityWasted, 0);
    const totalPrepared = wasteRecords.reduce((sum, r) => sum + (r.quantityPrepared || 0), 0);
    const wastePercentage = totalPrepared > 0 ? (totalWaste / totalPrepared) * 100 : 0;

    await prisma.dailySummary.upsert({
      where: { date: dateObj },
      create: {
        date: dateObj,
        totalAttendance: attendanceRecord?.count || 0,
        totalWaste,
        wastePercentage,
        mealType,
      },
      update: {
        totalAttendance: attendanceRecord?.count || 0,
        totalWaste,
        wastePercentage,
      },
    });
  }
}