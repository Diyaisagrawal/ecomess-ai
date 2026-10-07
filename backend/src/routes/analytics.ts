import express, { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// Get dashboard metrics
router.get('/dashboard', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;

    const metrics = await AnalyticsService.getDashboardMetrics(parseInt(days as string));

    res.json({ success: true, data: metrics });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch metrics',
    });
  }
});

// Get trend data
router.get('/trends/:metric', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { metric } = req.params;
    const { days = '30' } = req.query;

    const trendData = await AnalyticsService.getTrendData(
      metric as 'attendance' | 'waste',
      parseInt(days as string)
    );

    res.json({ success: true, data: trendData });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trends',
    });
  }
});

// Get KPI data
router.get('/kpi/today', authenticateToken, async (req: Request, res: Response) => {
  try {
    const kpiData = await AnalyticsService.getKPIData();

    res.json({ success: true, data: kpiData });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch KPI data',
    });
  }
});

export default router;