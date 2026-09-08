import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get current user profile
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      status: user.status,
      lastSeen: user.lastSeen ? user.lastSeen.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, avatarUrl, bio } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name && { name: name.trim() }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(bio !== undefined && { bio }),
      },
    });

    return res.json({
      id: updated.id,
      phoneNumber: updated.phoneNumber,
      name: updated.name,
      avatarUrl: updated.avatarUrl,
      bio: updated.bio,
      status: updated.status,
      lastSeen: updated.lastSeen ? updated.lastSeen.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Search contacts by phone number or name
router.get('/search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user!.userId } },
          {
            OR: [
              { phoneNumber: { contains: query.trim() } },
              { name: { contains: query.trim() } },
            ],
          },
        ],
      },
      take: 20,
    });

    return res.json(
      users.map((u: any) => ({
        id: u.id,
        phoneNumber: u.phoneNumber,
        name: u.name,
        avatarUrl: u.avatarUrl,
        bio: u.bio,
        status: u.status,
        lastSeen: u.lastSeen ? u.lastSeen.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
