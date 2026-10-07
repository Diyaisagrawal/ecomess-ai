import prisma from '../utils/prisma';
import { InventoryItemDTO, InventoryUpdate, InventoryAlert } from '../types/inventory';

export class InventoryService {
  // Create inventory item
  static async createInventoryItem(data: InventoryItemDTO) {
    return await prisma.inventoryItem.create({
      data: {
        name: data.name,
        category: data.category,
        unit: data.unit,
        quantity: data.quantity,
        minThreshold: data.minThreshold,
        maxThreshold: data.maxThreshold,
        unitCost: data.unitCost,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        supplier: data.supplier,
      },
    });
  }

  // Get all inventory items
  static async getAllInventory(category?: string) {
    const where = category ? { category } : {};
    return await prisma.inventoryItem.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  // Get single item
  static async getInventoryItem(id: number) {
    return await prisma.inventoryItem.findUnique({
      where: { id },
    });
  }

  // Update inventory
  static async updateInventory(id: number, data: InventoryUpdate) {
    return await prisma.inventoryItem.update({
      where: { id },
      data: {
        quantity: data.quantity,
        minThreshold: data.minThreshold,
        maxThreshold: data.maxThreshold,
        lastUpdatedDate: new Date(),
      },
    });
  }

  // Delete item
  static async deleteInventoryItem(id: number) {
    await prisma.inventoryItem.delete({ where: { id } });
  }

  // Get inventory alerts
  static async getInventoryAlerts(): Promise<InventoryAlert[]> {
    const items = await prisma.inventoryItem.findMany();
    const alerts: InventoryAlert[] = [];

    items.forEach((item) => {
      // Low stock alert
      if (item.quantity < item.minThreshold) {
        alerts.push({
          type: 'LOW_STOCK',
          item: item.name,
          currentValue: item.quantity,
          threshold: item.minThreshold,
        });
      }

      // Overstock alert
      if (item.quantity > item.maxThreshold) {
        alerts.push({
          type: 'OVERSTOCK',
          item: item.name,
          currentValue: item.quantity,
          threshold: item.maxThreshold,
        });
      }

      // Expiry alerts
      if (item.expiryDate) {
        const daysUntilExpiry = Math.ceil(
          (item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilExpiry < 0) {
          alerts.push({
            type: 'EXPIRED',
            item: item.name,
            currentValue: item.quantity,
            threshold: 0,
            daysUntilExpiry,
          });
        } else if (daysUntilExpiry < 7) {
          alerts.push({
            type: 'EXPIRING',
            item: item.name,
            currentValue: item.quantity,
            threshold: 0,
            daysUntilExpiry,
          });
        }
      }
    });

    return alerts.sort((a, b) => {
      const priorityMap = { EXPIRED: 0, LOW_STOCK: 1, EXPIRING: 2, OVERSTOCK: 3 };
      return priorityMap[a.type] - priorityMap[b.type];
    });
  }

  // Get inventory summary
  static async getInventorySummary() {
    const items = await prisma.inventoryItem.findMany();
    const alerts = await this.getInventoryAlerts();

    const totalValue = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    const categories = new Map<string, number>();
    items.forEach((item) => {
      categories.set(item.category, (categories.get(item.category) || 0) + 1);
    });

    return {
      totalItems: items.length,
      totalValue,
      alerts,
      byCategory: Object.fromEntries(categories),
      lowStockCount: alerts.filter((a) => a.type === 'LOW_STOCK').length,
      expiringCount: alerts.filter((a) => a.type === 'EXPIRING' || a.type === 'EXPIRED').length,
    };
  }
}