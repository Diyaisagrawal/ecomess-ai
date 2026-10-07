export interface AttendanceStats {
  totalAttendance: number;
  averageDaily: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  changePercent: number;
}

export interface DashboardMetrics {
  attendance: AttendanceStats;
  waste: {
    total: number;
    percentage: number;
    trend: string;
  };
  inventory: {
    totalItems: number;
    lowStock: number;
    expiring: number;
  };
  predictions?: {
    nextAttendance: number;
    nextDemand: number;
    confidence: number;
  };
}