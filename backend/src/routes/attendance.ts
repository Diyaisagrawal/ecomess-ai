import express, { Request, Response } from 'express';
import { AttendanceService } from '../services/attendance.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = express.Router();

// Create attendance record
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { date, count, mealType, notes } = req.body;

    if (!date || count === undefined) {
      return res.status(400).json({
        success: false,
        error: 'date and count are required',
      });
    }

    if (count < 0 || !Number.isInteger(count)) {
      return res.status(400).json({
        success: false,
        error: 'count must be a positive integer',
      });
    }

    const record = await AttendanceService.createAttendanceRecord(
      date,
      count,
      mealType || 'LUNCH',
      notes,
      req.user!.id
    );

    res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create attendance record',
    });
  }
});

// Get attendance records
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, mealType, page = 1, limit = 20 } = req.query;

    const result = await AttendanceService.getAttendanceRecords(
      startDate as string,
      endDate as string,
      mealType as string,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.json({ success: true, data: result.records, pagination: result.pagination });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch attendance records',
    });
  }
});

// Get attendance statistics
router.get('/stats/range', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required',
      });
    }

    const stats = await AttendanceService.getAttendanceStats(
      startDate as string,
      endDate as string
    );

    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch statistics',
    });
  }
});

// Get daily summary
router.get('/summary/:date', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { date } = req.params;

    const summary = await AttendanceService.getDailySummary(date);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'No summary found for this date',
      });
    }

    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summary',
    });
  }
});

// Get monthly summary
router.get('/summary/month/:year/:month', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params;

    const summary = await AttendanceService.getMonthlySummary(
      parseInt(year),
      parseInt(month)
    );

    if (!summary) {
      const generated = await AttendanceService.generateMonthlySummary(
        parseInt(year),
        parseInt(month)
      );
      return res.json({ success: true, data: generated });
    }

    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch monthly summary',
    });
  }
});

// Get trend data
router.get('/trends/:metric', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { metric } = req.params;
    const { days = '30' } = req.query;

    if (!['attendance', 'waste'].includes(metric)) {
      return res.status(400).json({
        success: false,
        error: 'metric must be "attendance" or "waste"',
      });
    }

    const trendData = await AttendanceService.getTrendData(
      metric as 'attendance' | 'waste',
      parseInt(days as string)
    );

    res.json({ success: true, data: trendData });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch trend data',
    });
  }
});

// Update attendance record
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { count, notes, mealType } = req.body;

    if (count !== undefined && (count < 0 || !Number.isInteger(count))) {
      return res.status(400).json({
        success: false,
        error: 'count must be a positive integer',
      });
    }

    const record = await AttendanceService.updateAttendanceRecord(parseInt(id), {
      count,
      notes,
      mealType,
    });

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update attendance record',
    });
  }
});

// Delete attendance record
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await AttendanceService.deleteAttendanceRecord(parseInt(id));

    res.json({ success: true, message: 'Attendance record deleted' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete attendance record',
    });
  }
});

export default router;