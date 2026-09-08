"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketGateway = setupSocketGateway;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const JWT_SECRET = process.env.JWT_SECRET || 'whisper_e2ee_super_secret_jwt_key_2026';
// Map of userId -> Set of Socket IDs
const activeUserSockets = new Map();
function setupSocketGateway(io) {
    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication token required for Socket.IO connection'));
        }
        jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decoded) => {
            if (err || !decoded) {
                return next(new Error('Invalid socket authentication token'));
            }
            socket.userId = decoded.userId;
            socket.phoneNumber = decoded.phoneNumber;
            next();
        });
    });
    io.on('connection', async (socket) => {
        const userId = socket.userId;
        console.log(`[Socket] User connected: ${userId} (Socket: ${socket.id})`);
        // Register active user socket
        if (!activeUserSockets.has(userId)) {
            activeUserSockets.set(userId, new Set());
        }
        activeUserSockets.get(userId).add(socket.id);
        // Update status to ONLINE
        await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { status: 'ONLINE' },
        }).catch(() => { });
        // Broadcast presence update
        io.emit('presence:update', {
            userId,
            status: 'ONLINE',
        });
        // 1. Handle Send Encrypted Message
        socket.on('message:send', async (data, callback) => {
            try {
                const { conversationId, recipientId, encryptedPayload, messageType, mediaUrl, mediaKey, replyToId } = data;
                if (!conversationId || !recipientId || !encryptedPayload) {
                    if (callback)
                        callback({ error: 'Invalid message payload' });
                    return;
                }
                // Zero-Knowledge Server Persistence
                const savedMessage = await prisma_1.prisma.message.create({
                    data: {
                        conversationId,
                        senderId: userId,
                        recipientId,
                        ciphertext: encryptedPayload.ciphertext,
                        iv: encryptedPayload.iv,
                        ephemeralPublicKey: encryptedPayload.ephemeralPublicKey,
                        ratchetSequence: encryptedPayload.ratchetSequence,
                        previousChainLength: encryptedPayload.previousChainLength,
                        oneTimePreKeyIdUsed: encryptedPayload.oneTimePreKeyIdUsed,
                        messageType: messageType || 'TEXT',
                        mediaUrl: mediaUrl || null,
                        mediaKey: mediaKey || null,
                        replyToId: replyToId || null,
                        status: 'SENT',
                    },
                });
                // Update conversation timestamp
                await prisma_1.prisma.conversation.update({
                    where: { id: conversationId },
                    data: { updatedAt: new Date() },
                });
                const dto = {
                    id: savedMessage.id,
                    conversationId: savedMessage.conversationId,
                    senderId: savedMessage.senderId,
                    recipientId: savedMessage.recipientId,
                    encryptedPayload: {
                        ciphertext: savedMessage.ciphertext,
                        iv: savedMessage.iv,
                        ephemeralPublicKey: savedMessage.ephemeralPublicKey,
                        ratchetSequence: savedMessage.ratchetSequence,
                        previousChainLength: savedMessage.previousChainLength,
                        oneTimePreKeyIdUsed: savedMessage.oneTimePreKeyIdUsed || undefined,
                    },
                    messageType: savedMessage.messageType,
                    mediaUrl: savedMessage.mediaUrl,
                    mediaKey: savedMessage.mediaKey,
                    replyToId: savedMessage.replyToId,
                    status: savedMessage.status,
                    createdAt: savedMessage.createdAt.toISOString(),
                };
                // Acknowledge back to sender
                if (callback)
                    callback({ success: true, message: dto });
                // Relay to recipient if online
                const recipientSockets = activeUserSockets.get(recipientId);
                if (recipientSockets && recipientSockets.size > 0) {
                    recipientSockets.forEach((sId) => {
                        io.to(sId).emit('message:receive', dto);
                    });
                    // Mark as DELIVERED in DB
                    await prisma_1.prisma.message.update({
                        where: { id: savedMessage.id },
                        data: { status: 'DELIVERED' },
                    });
                    // Notify sender of delivery tick
                    const senderSockets = activeUserSockets.get(userId);
                    if (senderSockets) {
                        senderSockets.forEach((sId) => {
                            io.to(sId).emit('message:delivered', {
                                messageIds: [savedMessage.id],
                                conversationId,
                                deliveredToUserId: recipientId,
                            });
                        });
                    }
                }
            }
            catch (err) {
                console.error('[Socket] Message send error:', err);
                if (callback)
                    callback({ error: err.message || 'Failed to send message' });
            }
        });
        // 2. Handle Read Receipts
        socket.on('message:read', async (data) => {
            try {
                const { messageIds, conversationId } = data;
                if (!messageIds || messageIds.length === 0)
                    return;
                await prisma_1.prisma.message.updateMany({
                    where: {
                        id: { in: messageIds },
                        recipientId: userId,
                    },
                    data: { status: 'READ' },
                });
                // Broadcast read receipt update
                io.to(conversationId).emit('message:read', {
                    messageIds,
                    conversationId,
                    readByUserId: userId,
                });
                const messages = await prisma_1.prisma.message.findMany({
                    where: { id: { in: messageIds } },
                    select: { senderId: true },
                });
                const senderIds = Array.from(new Set(messages.map((m) => m.senderId)));
                senderIds.forEach((sId) => {
                    const sSockets = activeUserSockets.get(sId);
                    if (sSockets) {
                        sSockets.forEach((socketId) => {
                            io.to(socketId).emit('message:read', {
                                messageIds,
                                conversationId,
                                readByUserId: userId,
                            });
                        });
                    }
                });
            }
            catch (err) {
                console.error('[Socket] Read receipt error:', err);
            }
        });
        // 3. Typing Indicators
        socket.on('typing:start', (data) => {
            socket.broadcast.emit('typing:start', { ...data, userId });
        });
        socket.on('typing:stop', (data) => {
            socket.broadcast.emit('typing:stop', { ...data, userId });
        });
        // Disconnect Handler
        socket.on('disconnect', async () => {
            console.log(`[Socket] User disconnected: ${userId} (Socket: ${socket.id})`);
            const userSockets = activeUserSockets.get(userId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    activeUserSockets.delete(userId);
                    const lastSeen = new Date();
                    await prisma_1.prisma.user.update({
                        where: { id: userId },
                        data: { status: 'OFFLINE', lastSeen },
                    }).catch(() => { });
                    io.emit('presence:update', {
                        userId,
                        status: 'OFFLINE',
                        lastSeen: lastSeen.toISOString(),
                    });
                }
            }
        });
    });
}
