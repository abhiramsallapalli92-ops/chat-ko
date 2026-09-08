"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoubleRatchetSession = void 0;
const utils_1 = require("./utils");
class DoubleRatchetSession {
    dhsPrivateKey;
    dhsPublicKey;
    dhrPublicKey = null;
    rootKey;
    sendingChainKey = null;
    receivingChainKey = null;
    sendingSequence = 0;
    receivingSequence = 0;
    previousChainLength = 0;
    skippedMessageKeys = new Map();
    constructor() { }
    // Initialize session as Alice (Initiator)
    static async initAsAlice(sharedMasterKey, bobRatchetPublicKeyBase64) {
        const session = new DoubleRatchetSession();
        const dhsPair = await (0, utils_1.generateECDHKeyPair)();
        session.dhsPrivateKey = dhsPair.privateKey;
        session.dhsPublicKey = dhsPair.publicKey;
        session.dhrPublicKey = await (0, utils_1.importPublicKey)(bobRatchetPublicKeyBase64);
        // Initial DH step
        const dhSecret = await (0, utils_1.computeSharedSecret)(session.dhsPrivateKey, session.dhrPublicKey);
        const { key1: newRootKey, key2: sendingChainKey } = await (0, utils_1.hkdf)(dhSecret, sharedMasterKey, 'Whisper-Ratchet-Root');
        session.rootKey = newRootKey;
        session.sendingChainKey = sendingChainKey;
        session.receivingChainKey = null;
        session.sendingSequence = 0;
        session.receivingSequence = 0;
        session.previousChainLength = 0;
        return session;
    }
    // Initialize session as Bob (Receiver)
    static async initAsBob(sharedMasterKey, bobDHKeyPair) {
        const session = new DoubleRatchetSession();
        session.dhsPrivateKey = bobDHKeyPair.privateKey;
        session.dhsPublicKey = bobDHKeyPair.publicKey;
        session.dhrPublicKey = null;
        session.rootKey = sharedMasterKey;
        session.sendingChainKey = null;
        session.receivingChainKey = null;
        session.sendingSequence = 0;
        session.receivingSequence = 0;
        session.previousChainLength = 0;
        return session;
    }
    // Encrypt plaintext message
    async encrypt(plaintext) {
        if (!this.sendingChainKey) {
            throw new Error('Sending chain key not initialized in Double Ratchet session');
        }
        // Advance symmetric sending chain ratchet
        const { key1: nextSendingChainKey, key2: messageKey } = await (0, utils_1.hkdf)(this.sendingChainKey, new Uint8Array(32).buffer, 'Whisper-Ratchet-Message');
        this.sendingChainKey = nextSendingChainKey;
        const plaintextBuffer = (0, utils_1.stringToArrayBuffer)(plaintext);
        const { ciphertext, iv } = await (0, utils_1.encryptAESGCM)(plaintextBuffer, messageKey);
        const dhsPublicBase64 = await (0, utils_1.exportPublicKey)(this.dhsPublicKey);
        const payload = {
            ciphertext: (0, utils_1.arrayBufferToBase64)(ciphertext),
            iv: (0, utils_1.arrayBufferToBase64)(iv),
            ephemeralPublicKey: dhsPublicBase64,
            ratchetSequence: this.sendingSequence,
            previousChainLength: this.previousChainLength,
        };
        this.sendingSequence++;
        return payload;
    }
    // Decrypt incoming payload
    async decrypt(payload) {
        const remotePublicBase64 = payload.ephemeralPublicKey;
        const ciphertextBuffer = (0, utils_1.base64ToArrayBuffer)(payload.ciphertext);
        const ivBuffer = (0, utils_1.base64ToArrayBuffer)(payload.iv);
        // Check if key for this sequence was skipped previously
        const skipKey = `${remotePublicBase64}:${payload.ratchetSequence}`;
        if (this.skippedMessageKeys.has(skipKey)) {
            const messageKey = this.skippedMessageKeys.get(skipKey);
            this.skippedMessageKeys.delete(skipKey);
            const plaintextBuffer = await (0, utils_1.decryptAESGCM)(ciphertextBuffer, messageKey, ivBuffer);
            return (0, utils_1.arrayBufferToString)(plaintextBuffer);
        }
        // Check if new DH ratchet step is required
        const currentDHRBase64 = this.dhrPublicKey ? await (0, utils_1.exportPublicKey)(this.dhrPublicKey) : null;
        if (currentDHRBase64 !== remotePublicBase64) {
            await this.skipMessageKeys(payload.previousChainLength);
            await this.dhRatchetStep(remotePublicBase64);
        }
        await this.skipMessageKeys(payload.ratchetSequence);
        // Advance symmetric receiving chain ratchet
        if (!this.receivingChainKey) {
            throw new Error('Receiving chain key null during decryption step');
        }
        const { key1: nextReceivingChainKey, key2: messageKey } = await (0, utils_1.hkdf)(this.receivingChainKey, new Uint8Array(32).buffer, 'Whisper-Ratchet-Message');
        this.receivingChainKey = nextReceivingChainKey;
        this.receivingSequence++;
        const plaintextBuffer = await (0, utils_1.decryptAESGCM)(ciphertextBuffer, messageKey, ivBuffer);
        return (0, utils_1.arrayBufferToString)(plaintextBuffer);
    }
    async skipMessageKeys(untilSequence) {
        if (!this.receivingChainKey)
            return;
        while (this.receivingSequence < untilSequence) {
            const { key1: nextReceivingChainKey, key2: messageKey } = await (0, utils_1.hkdf)(this.receivingChainKey, new Uint8Array(32).buffer, 'Whisper-Ratchet-Message');
            this.receivingChainKey = nextReceivingChainKey;
            const remotePublicBase64 = this.dhrPublicKey ? await (0, utils_1.exportPublicKey)(this.dhrPublicKey) : '';
            const skipKey = `${remotePublicBase64}:${this.receivingSequence}`;
            this.skippedMessageKeys.set(skipKey, messageKey);
            this.receivingSequence++;
        }
    }
    async dhRatchetStep(remotePublicBase64) {
        this.previousChainLength = this.sendingSequence;
        this.sendingSequence = 0;
        this.receivingSequence = 0;
        this.dhrPublicKey = await (0, utils_1.importPublicKey)(remotePublicBase64);
        // DH receive step
        const dhReceiveSecret = await (0, utils_1.computeSharedSecret)(this.dhsPrivateKey, this.dhrPublicKey);
        const { key1: rootKey1, key2: receivingChainKey } = await (0, utils_1.hkdf)(dhReceiveSecret, this.rootKey, 'Whisper-Ratchet-Root');
        this.rootKey = rootKey1;
        this.receivingChainKey = receivingChainKey;
        // DH send step (generate new ephemeral key pair)
        const newDHSPair = await (0, utils_1.generateECDHKeyPair)();
        this.dhsPrivateKey = newDHSPair.privateKey;
        this.dhsPublicKey = newDHSPair.publicKey;
        const dhSendSecret = await (0, utils_1.computeSharedSecret)(this.dhsPrivateKey, this.dhrPublicKey);
        const { key1: rootKey2, key2: sendingChainKey } = await (0, utils_1.hkdf)(dhSendSecret, this.rootKey, 'Whisper-Ratchet-Root');
        this.rootKey = rootKey2;
        this.sendingChainKey = sendingChainKey;
    }
    // Serialize session state for IndexedDB storage
    async exportState() {
        const dhsPrivate = await (0, utils_1.exportPrivateKey)(this.dhsPrivateKey);
        const dhsPublic = await (0, utils_1.exportPublicKey)(this.dhsPublicKey);
        const dhrPublic = this.dhrPublicKey ? await (0, utils_1.exportPublicKey)(this.dhrPublicKey) : null;
        const skippedRecord = {};
        for (const [k, v] of this.skippedMessageKeys.entries()) {
            skippedRecord[k] = (0, utils_1.arrayBufferToBase64)(v);
        }
        return {
            dhsPrivate,
            dhsPublic,
            dhrPublic,
            rootKey: (0, utils_1.arrayBufferToBase64)(this.rootKey),
            sendingChainKey: this.sendingChainKey ? (0, utils_1.arrayBufferToBase64)(this.sendingChainKey) : null,
            receivingChainKey: this.receivingChainKey ? (0, utils_1.arrayBufferToBase64)(this.receivingChainKey) : null,
            sendingSequence: this.sendingSequence,
            receivingSequence: this.receivingSequence,
            previousChainLength: this.previousChainLength,
            skippedMessageKeys: skippedRecord,
        };
    }
    // Reconstitute session state from IndexedDB storage
    static async importState(state) {
        const session = new DoubleRatchetSession();
        session.dhsPrivateKey = await (0, utils_1.importPrivateKey)(state.dhsPrivate);
        session.dhsPublicKey = await (0, utils_1.importPublicKey)(state.dhsPublic);
        session.dhrPublicKey = state.dhrPublic ? await (0, utils_1.importPublicKey)(state.dhrPublic) : null;
        session.rootKey = (0, utils_1.base64ToArrayBuffer)(state.rootKey);
        session.sendingChainKey = state.sendingChainKey ? (0, utils_1.base64ToArrayBuffer)(state.sendingChainKey) : null;
        session.receivingChainKey = state.receivingChainKey ? (0, utils_1.base64ToArrayBuffer)(state.receivingChainKey) : null;
        session.sendingSequence = state.sendingSequence;
        session.receivingSequence = state.receivingSequence;
        session.previousChainLength = state.previousChainLength;
        session.skippedMessageKeys = new Map();
        if (state.skippedMessageKeys) {
            for (const [k, v] of Object.entries(state.skippedMessageKeys)) {
                session.skippedMessageKeys.set(k, (0, utils_1.base64ToArrayBuffer)(v));
            }
        }
        return session;
    }
}
exports.DoubleRatchetSession = DoubleRatchetSession;
