"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../prisma");
const otpService_1 = require("../services/otpService");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'whisper_e2ee_super_secret_jwt_key_2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'whisper_e2ee_super_secret_refresh_jwt_key_2026';
// 1. Send OTP
router.post('/send-otp', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return res.status(400).json({ error: 'Valid phone number is required' });
        }
        const result = await (0, otpService_1.sendOtp)(phoneNumber.trim());
        return res.json(result);
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Failed to send OTP' });
    }
});
// 2. Verify OTP & Authenticate
router.post('/verify-otp', async (req, res) => {
    try {
        const { phoneNumber, code } = req.body;
        if (!phoneNumber || !code) {
            return res.status(400).json({ error: 'Phone number and verification code are required' });
        }
        const isValid = await (0, otpService_1.verifyOtp)(phoneNumber.trim(), code.trim());
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid or expired OTP verification code' });
        }
        // Upsert User
        let user = await prisma_1.prisma.user.findUnique({
            where: { phoneNumber: phoneNumber.trim() },
        });
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    phoneNumber: phoneNumber.trim(),
                    name: `User ${phoneNumber.slice(-4)}`,
                },
            });
        }
        // Issue JWTs
        const accessToken = jsonwebtoken_1.default.sign({ userId: user.id, phoneNumber: user.phoneNumber }, JWT_SECRET, { expiresIn: '15m' });
        const refreshToken = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken },
        });
        return res.json({
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                phoneNumber: user.phoneNumber,
                name: user.name,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
                status: user.status,
                lastSeen: user.lastSeen ? user.lastSeen.toISOString() : null,
                createdAt: user.createdAt.toISOString(),
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Verification failed' });
    }
});
// 3. Register Client Public Key Bundle (E2EE)
router.post('/register-keys', auth_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { deviceId, registrationId, identityPublicKey, signedPreKey, oneTimePreKeys } = req.body;
        if (!deviceId || !identityPublicKey || !signedPreKey) {
            return res.status(400).json({ error: 'Incomplete key bundle payload' });
        }
        // Upsert Device record
        const device = await prisma_1.prisma.device.upsert({
            where: { deviceId },
            update: { registrationId, userId },
            create: { deviceId, userId, registrationId },
        });
        // Upsert Key Bundle
        await prisma_1.prisma.preKeyBundle.upsert({
            where: { deviceId: device.deviceId },
            update: {
                identityPublicKey,
                signedPreKeyId: signedPreKey.keyId,
                signedPreKeyPub: signedPreKey.publicKey,
                signedPreKeySig: signedPreKey.signature,
                oneTimePreKeys: JSON.stringify(oneTimePreKeys || []),
            },
            create: {
                deviceId: device.deviceId,
                identityPublicKey,
                signedPreKeyId: signedPreKey.keyId,
                signedPreKeyPub: signedPreKey.publicKey,
                signedPreKeySig: signedPreKey.signature,
                oneTimePreKeys: JSON.stringify(oneTimePreKeys || []),
            },
        });
        return res.json({ success: true, message: 'E2EE Public key bundle registered' });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Key registration failed' });
    }
});
// 4. Fetch Contact PreKey Bundle for Initiating X3DH Session
router.get('/prekey-bundle/:userId', auth_1.authenticateToken, async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const device = await prisma_1.prisma.device.findFirst({
            where: { userId: targetUserId },
            include: { keyBundle: true },
        });
        if (!device || !device.keyBundle) {
            return res.status(404).json({ error: 'Target contact has no registered device key bundle' });
        }
        const bundle = device.keyBundle;
        const oneTimeKeys = JSON.parse(bundle.oneTimePreKeys || '[]');
        // Pop one prekey if available
        let selectedOneTimeKey = undefined;
        if (oneTimeKeys.length > 0) {
            selectedOneTimeKey = oneTimeKeys.shift();
            // Update store
            await prisma_1.prisma.preKeyBundle.update({
                where: { id: bundle.id },
                data: { oneTimePreKeys: JSON.stringify(oneTimeKeys) },
            });
        }
        return res.json({
            userId: targetUserId,
            deviceId: device.deviceId,
            registrationId: device.registrationId,
            identityPublicKey: bundle.identityPublicKey,
            signedPreKey: {
                keyId: bundle.signedPreKeyId,
                publicKey: bundle.signedPreKeyPub,
                signature: bundle.signedPreKeySig,
            },
            oneTimePreKey: selectedOneTimeKey,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to fetch prekey bundle' });
    }
});
exports.default = router;
