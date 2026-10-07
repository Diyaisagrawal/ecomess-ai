export interface WasteRecordDTO {
  date: string;
  foodItem: string;
  category: string;
  quantityWasted: number;
  quantityPrepared?: number;
  reason?: string;
  mealType: string;
}

export interface WasteFilter {
  startDate?: string;
  endDate?: string;
  category?: string;
  foodItem?: string;
  mealType?: string;
}

export interface WasteStats {
  totalWaste: number;
  averageDaily: number;
  topWastedItems: Array<{
    foodItem: string;
    quantity: number;
    percentage: number;
  }>;
  wasteByCategory: Array<{
    category: string;
    quantity: number;
    percentage: number;
  }>;
}