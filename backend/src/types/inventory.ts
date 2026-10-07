export interface InventoryItemDTO {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  maxThreshold: number;
  unitCost: number;
  expiryDate?: string;
  supplier?: string;
}

export interface InventoryUpdate {
  quantity: number;
  minThreshold?: number;
  maxThreshold?: number;
}

export interface InventoryAlert {
  type: 'LOW_STOCK' | 'OVERSTOCK' | 'EXPIRING' | 'EXPIRED';
  item: string;
  currentValue: number;
  threshold: number;
  daysUntilExpiry?: number;
}