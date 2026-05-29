import express, { Request, Response } from 'express';
import prisma from '../utils/prisma';

const router = express.Router();

// GET all attendance records
router.get('/', async (req: Request, res: Response) => {
  try {
    const records = await prisma.attendance.findMany();
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch records' });
  }
});

// POST new attendance record
router.post('/', async (req: Request, res: Response) => {
  try {
    const { date, count } = req.body;

    if (!date || !count) {
      return res.status(400).json({
        success: false,
        error: 'date and count are required',
      });
    }

    const record = await prisma.attendance.create({
      data: {
        date: new Date(date),
        count: parseInt(count),
      },
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create record' });
  }
});

export default router;
