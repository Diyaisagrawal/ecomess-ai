import express, { Request, Response } from 'express';
import { WasteService } from '../services/waste.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { WasteRecordDTO, WasteFilter } from '../types/waste';

const router = express.Router();

// Create waste record
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { date, foodItem, category, quantityWasted, quantityPrepared, reason, mealType } =
      req.body as WasteRecordDTO;

    // Validation
    if (!date || !foodItem || !category || !quantityWasted || !mealType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    if (quantityWasted < 0) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be positive',
      });
    }

    const record = await WasteService.createWasteRecord(req.user!.id, {
      date,
      foodItem,
      category,
      quantityWasted,
      quantityPrepared,
      reason,
      mealType,
    });

    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create waste record',
    });
  }
});

// Get waste records with filters
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, category, foodItem, mealType, page = 1, limit = 20 } = req.query;

    const filters: WasteFilter = {
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as string,
      foodItem: foodItem as string,
      mealType: mealType as string,
    };

    const result = await WasteService.getWasteRecords(
      req.user!.id,
      filters,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result.records,
      pagination: result.pagination,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch waste records',
    });
  }
});

// Get waste statistics
router.get('/stats/:startDate/:endDate', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.params;

    const stats = await WasteService.getWasteStats(startDate, endDate);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch statistics',
    });
  }
});

// Update waste record
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body as Partial<WasteRecordDTO>;

    const record = await WasteService.updateWasteRecord(parseInt(id), data);

    res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update waste record',
    });
  }
});

// Delete waste record
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await WasteService.deleteWasteRecord(parseInt(id));

    res.json({
      success: true,
      message: 'Waste record deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete waste record',
    });
  }
});

export default router;