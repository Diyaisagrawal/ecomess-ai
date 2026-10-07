import express, { Request, Response } from 'express';
import { PredictionService } from '../services/prediction.service';
import { authenticateToken, authorize } from '../middleware/auth.middleware';

const router = express.Router();
const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER'];
const TYPES = ['ATTENDANCE', 'DEMAND', 'WASTE'];

const fail = (res: Response, error: any, fallback: string) =>
  res.status(error?.status && error.status >= 400 ? error.status : 500).json({
    success: false,
    error: error?.message || fallback,
  });

const mealOf = (v: unknown) => {
  const meal = String(v || 'LUNCH').toUpperCase();
  return MEALS.includes(meal) ? meal : null;
};

router.use(authenticateToken);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, startDate, endDate, limit = '50' } = req.query;
    const data = await PredictionService.getPredictions(
      type as string,
      startDate as string,
      endDate as string,
      Math.min(parseInt(limit as string, 10) || 50, 500)
    );
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'Failed to fetch predictions');
  }
});

const single =
  (fn: (date: string, meal: string) => Promise<unknown>, label: string) =>
  async (req: Request, res: Response) => {
    const { date } = req.body;
    const meal = mealOf(req.body.mealType);
    if (!date || Number.isNaN(Date.parse(date))) {
      return res.status(400).json({ success: false, error: 'A valid date (YYYY-MM-DD) is required' });
    }
    if (!meal) return res.status(400).json({ success: false, error: `mealType must be one of ${MEALS.join(', ')}` });
    try {
      res.json({ success: true, data: await fn(date, meal) });
    } catch (error) {
      fail(res, error, `Failed to predict ${label}`);
    }
  };

router.post('/attendance', single((d, m) => PredictionService.predictAttendance(d, m), 'attendance'));
router.post('/demand', single((d, m) => PredictionService.predictDemand(d, m), 'demand'));
router.post('/waste', single((d, m) => PredictionService.predictWaste(d, m), 'waste'));

router.get('/forecast/week', async (req: Request, res: Response) => {
  const meal = mealOf(req.query.mealType);
  if (!meal) return res.status(400).json({ success: false, error: `mealType must be one of ${MEALS.join(', ')}` });
  try {
    res.json({ success: true, data: await PredictionService.get7DayForecast(meal) });
  } catch (error) {
    fail(res, error, 'Failed to get forecast');
  }
});

router.get('/accuracy/:type', async (req: Request, res: Response) => {
  const type = req.params.type.toUpperCase();
  if (!TYPES.includes(type)) return res.status(400).json({ success: false, error: `type must be one of ${TYPES.join(', ')}` });
  try {
    const days = parseInt((req.query.days as string) || '30', 10);
    res.json({ success: true, data: await PredictionService.getModelAccuracy(type, days) });
  } catch (error) {
    fail(res, error, 'Failed to fetch accuracy metrics');
  }
});

router.put('/:id/actual', authorize(['MANAGER', 'ADMIN']), async (req: Request, res: Response) => {
  const { actualValue } = req.body;
  if (typeof actualValue !== 'number') {
    return res.status(400).json({ success: false, error: 'actualValue (number) is required' });
  }
  try {
    const data = await PredictionService.updatePredictionActual(parseInt(req.params.id, 10), actualValue);
    res.json({ success: true, data });
  } catch (error) {
    fail(res, error, 'Failed to update prediction');
  }
});

router.post('/train/trigger', authorize(['MANAGER', 'ADMIN']), async (_req: Request, res: Response) => {
  try {
    const data = await PredictionService.triggerTraining();
    res.status(202).json({ success: true, data, message: 'Model training triggered' });
  } catch (error) {
    fail(res, error, 'Failed to trigger training');
  }
});

router.get('/train/status/:jobId', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await PredictionService.getTrainingStatus(req.params.jobId) });
  } catch (error) {
    fail(res, error, 'Failed to get training status');
  }
});

router.get('/models', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await PredictionService.getModels() });
  } catch (error) {
    fail(res, error, 'Failed to fetch models');
  }
});

router.get('/models/:modelName/metrics', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await PredictionService.getModelMetrics(req.params.modelName) });
  } catch (error) {
    fail(res, error, 'Failed to fetch metrics');
  }
});

router.get('/recommendations', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await PredictionService.getRecommendations() });
  } catch (error) {
    fail(res, error, 'Failed to fetch recommendations');
  }
});

export default router;
