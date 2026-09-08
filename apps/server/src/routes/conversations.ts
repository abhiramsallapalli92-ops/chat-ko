import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get active conversations list for logged in user
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: { user: true },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const result = participants.map((p: any) => {
      const conv = p.conversation;
      const otherParticipants = conv.participants.map((part: any) => ({
        id: part.user.id,
        phoneNumber: part.user.phoneNumber,
        name: part.user.name,
        avatarUrl: part.user.avatarUrl,
        bio: part.user.bio,
        status: part.user.status,
        lastSeen: part.user.lastSeen ? part.user.lastSeen.toISOString() : null,
        createdAt: part.user.createdAt.toISOString(),
      }));

      const lastMsg = conv.messages[0];

      return {
        id: conv.id,
        isGroup: conv.isGroup,
        name: conv.name,
        groupAvatar: conv.groupAvatar,
        participants: otherParticipants,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              conversationId: lastMsg.conversationId,
              senderId: lastMsg.senderId,
              recipientId: lastMsg.recipientId,
              encryptedPayload: {
                ciphertext: lastMsg.ciphertext,
                iv: lastMsg.iv,
                ephemeralPublicKey: lastMsg.ephemeralPublicKey,
                ratchetSequence: lastMsg.ratchetSequence,
                previousChainLength: lastMsg.previousChainLength,
                oneTimePreKeyIdUsed: lastMsg.oneTimePreKeyIdUsed || undefined,
              },
              messageType: lastMsg.messageType,
              mediaUrl: lastMsg.mediaUrl,
              mediaKey: lastMsg.mediaKey,
              replyToId: lastMsg.replyToId,
              status: lastMsg.status,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
        updatedAt: conv.updatedAt.toISOString(),
      };
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Create or get existing 1:1 conversation with recipient
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user!.userId;
    const { recipientUserId, recipientPhoneNumber } = req.body;

    let targetUserId = recipientUserId;

    if (!targetUserId && recipientPhoneNumber) {
      const targetUser = await prisma.user.findUnique({
        where: { phoneNumber: recipientPhoneNumber.trim() },
      });
      if (!targetUser) {
        return res.status(404).json({ error: 'Recipient phone number not registered' });
      }
      targetUserId = targetUser.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'Recipient identifier is required' });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: 'Cannot create conversation with yourself' });
    }

    // Check if 1:1 conversation already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUserId } } },
        ],
      },
      include: {
        participants: { include: { user: true } },
      },
    });

    if (existing) {
      return res.json({
        id: existing.id,
        isGroup: existing.isGroup,
        participants: existing.participants.map((part: any) => ({
          id: part.user.id,
          phoneNumber: part.user.phoneNumber,
          name: part.user.name,
          avatarUrl: part.user.avatarUrl,
          bio: part.user.bio,
          status: part.user.status,
          lastSeen: part.user.lastSeen ? part.user.lastSeen.toISOString() : null,
          createdAt: part.user.createdAt.toISOString(),
        })),
        updatedAt: existing.updatedAt.toISOString(),
      });
    }

    // Create new conversation
    const newConv = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: {
          create: [
            { userId: currentUserId, role: 'ADMIN' },
            { userId: targetUserId, role: 'MEMBER' },
          ],
        },
      },
      include: {
        participants: { include: { user: true } },
      },
    });

    return res.json({
      id: newConv.id,
      isGroup: newConv.isGroup,
      participants: newConv.participants.map((part: any) => ({
        id: part.user.id,
        phoneNumber: part.user.phoneNumber,
        name: part.user.name,
        avatarUrl: part.user.avatarUrl,
        bio: part.user.bio,
        status: part.user.status,
        lastSeen: part.user.lastSeen ? part.user.lastSeen.toISOString() : null,
        createdAt: part.user.createdAt.toISOString(),
      })),
      updatedAt: newConv.updatedAt.toISOString(),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// Fetch encrypted messages for a conversation
router.get('/:id/messages', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const conversationId = req.params.id;

    // Verify membership
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return res.json(
      messages.map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        recipientId: m.recipientId,
        encryptedPayload: {
          ciphertext: m.ciphertext,
          iv: m.iv,
          ephemeralPublicKey: m.ephemeralPublicKey,
          ratchetSequence: m.ratchetSequence,
          previousChainLength: m.previousChainLength,
          oneTimePreKeyIdUsed: m.oneTimePreKeyIdUsed || undefined,
        },
        messageType: m.messageType,
        mediaUrl: m.mediaUrl,
        mediaKey: m.mediaKey,
        replyToId: m.replyToId,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
