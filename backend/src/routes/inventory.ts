import express, { Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';
import { authenticateToken } from '../middleware/auth.middleware';
import { InventoryItemDTO, InventoryUpdate } from '../types/inventory';

const router = express.Router();

// Create inventory item
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name, category, unit, quantity, minThreshold, maxThreshold, unitCost, expiryDate, supplier } =
      req.body as InventoryItemDTO;

    if (!name || !category || !unit) {
      return res.status(400).json({
        success: false,
        error: 'name, category, and unit are required',
      });
    }

    const item = await InventoryService.createInventoryItem({
      name,
      category,
      unit,
      quantity,
      minThreshold,
      maxThreshold,
      unitCost,
      expiryDate,
      supplier,
    });

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create inventory item',
    });
  }
});

// Get all inventory
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    const items = await InventoryService.getAllInventory(category as string);

    res.json({
      success: true,
      data: items,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch inventory',
    });
  }
});

// Get single item
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const item = await InventoryService.getInventoryItem(parseInt(id));

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found',
      });
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch item',
    });
  }
});

// Update inventory
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body as InventoryUpdate;

    const item = await InventoryService.updateInventory(parseInt(id), data);

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update inventory',
    });
  }
});

// Delete item
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await InventoryService.deleteInventoryItem(parseInt(id));

    res.json({
      success: true,
      message: 'Item deleted',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete item',
    });
  }
});

// Get alerts
router.get('/alerts/summary', authenticateToken, async (req: Request, res: Response) => {
  try {
    const alerts = await InventoryService.getInventoryAlerts();

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch alerts',
    });
  }
});

// Get summary
router.get('/summary/overview', authenticateToken, async (req: Request, res: Response) => {
  try {
    const summary = await InventoryService.getInventorySummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summary',
    });
  }
});

export default router;