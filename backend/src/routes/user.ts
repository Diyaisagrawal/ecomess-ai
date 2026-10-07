import express, { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { authenticateToken, authorize } from '../middleware/auth.middleware';

const router = express.Router();

const publicUser = { id: true, email: true, name: true, role: true, createdAt: true } as const;
const ROLES = ['STAFF', 'MANAGER', 'ADMIN'];

// List users (managers and admins)
router.get('/', authenticateToken, authorize(['MANAGER', 'ADMIN']), async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({ select: publicUser, orderBy: { createdAt: 'asc' } });
    res.json({ success: true, data: users });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

// Get single user (self, or manager/admin)
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid id' });
  if (req.user!.id !== id && !['MANAGER', 'ADMIN'].includes(req.user!.role)) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id }, select: publicUser });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
});

// Change a user's role (admin only)
router.patch('/:id/role', authenticateToken, authorize(['ADMIN']), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;
  if (!ROLES.includes(role)) {
    return res.status(400).json({ success: false, error: `role must be one of ${ROLES.join(', ')}` });
  }
  try {
    const user = await prisma.user.update({ where: { id }, data: { role }, select: publicUser });
    res.json({ success: true, data: user });
  } catch {
    res.status(404).json({ success: false, error: 'User not found' });
  }
});

export default router;
