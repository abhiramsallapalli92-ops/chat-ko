"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get current user profile
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.userId },
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
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Update profile
router.put('/profile', auth_1.authenticateToken, async (req, res) => {
    try {
        const { name, avatarUrl, bio } = req.body;
        const updated = await prisma_1.prisma.user.update({
            where: { id: req.user.userId },
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
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
// Search contacts by phone number or name
router.get('/search', auth_1.authenticateToken, async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.trim().length === 0) {
            return res.json([]);
        }
        const users = await prisma_1.prisma.user.findMany({
            where: {
                AND: [
                    { id: { not: req.user.userId } },
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
        return res.json(users.map((u) => ({
            id: u.id,
            phoneNumber: u.phoneNumber,
            name: u.name,
            avatarUrl: u.avatarUrl,
            bio: u.bio,
            status: u.status,
            lastSeen: u.lastSeen ? u.lastSeen.toISOString() : null,
            createdAt: u.createdAt.toISOString(),
        })));
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
});
exports.default = router;
