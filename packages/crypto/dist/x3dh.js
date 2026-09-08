"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClientDeviceKeys = generateClientDeviceKeys;
exports.extractPublicBundle = extractPublicBundle;
exports.initiateX3DHSession = initiateX3DHSession;
exports.receiveX3DHSession = receiveX3DHSession;
const utils_1 = require("./utils");
// Generate device keys (Identity Key, Signed PreKey, One-time PreKeys)
async function generateClientDeviceKeys(oneTimeKeysCount = 10) {
    const registrationId = Math.floor(Math.random() * 1000000);
    // 1. Identity Key Pair
    const identityKeyPair = await (0, utils_1.generateECDHKeyPair)();
    const ikPublicBase64 = await (0, utils_1.exportPublicKey)(identityKeyPair.publicKey);
    const ikPrivateBase64 = await (0, utils_1.exportPrivateKey)(identityKeyPair.privateKey);
    // 2. Signed PreKey Pair
    const signedPreKeyPair = await (0, utils_1.generateECDHKeyPair)();
    const spkPublicBase64 = await (0, utils_1.exportPublicKey)(signedPreKeyPair.publicKey);
    const spkPrivateBase64 = await (0, utils_1.exportPrivateKey)(signedPreKeyPair.privateKey);
    // Self-signature of Signed PreKey using subtle HMAC/Digest for validation
    const subtle = (0, utils_1.getSubtleCrypto)();
    const sigBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(spkPublicBase64 + ikPublicBase64));
    const signatureBase64 = (0, utils_1.arrayBufferToBase64)(sigBuffer);
    // 3. One-Time PreKeys
    const oneTimePreKeys = [];
    for (let i = 1; i <= oneTimeKeysCount; i++) {
        const otpkPair = await (0, utils_1.generateECDHKeyPair)();
        oneTimePreKeys.push({
            keyId: i,
            privateKey: await (0, utils_1.exportPrivateKey)(otpkPair.privateKey),
            publicKey: await (0, utils_1.exportPublicKey)(otpkPair.publicKey),
        });
    }
    return {
        registrationId,
        identityKey: {
            privateKey: ikPrivateBase64,
            publicKey: ikPublicBase64,
        },
        signedPreKey: {
            keyId: 1,
            privateKey: spkPrivateBase64,
            publicKey: spkPublicBase64,
            signature: signatureBase64,
        },
        oneTimePreKeys,
    };
}
// Extract public key bundle for uploading to server
function extractPublicBundle(keys) {
    return {
        identityPublicKey: keys.identityKey.publicKey,
        signedPreKey: {
            keyId: keys.signedPreKey.keyId,
            publicKey: keys.signedPreKey.publicKey,
            signature: keys.signedPreKey.signature,
        },
        oneTimePreKeys: keys.oneTimePreKeys.map((k) => ({
            keyId: k.keyId,
            publicKey: k.publicKey,
        })),
    };
}
// X3DH Initiator (Alice) establishing session with Bob's PreKey Bundle
async function initiateX3DHSession(aliceIdentityPrivateKey, bobBundle) {
    // Alice generates an Ephemeral Key Pair
    const aliceEphemeralKeyPair = await (0, utils_1.generateECDHKeyPair)();
    const aliceEphemeralPublicBase64 = await (0, utils_1.exportPublicKey)(aliceEphemeralKeyPair.publicKey);
    const bobIK = await (0, utils_1.importPublicKey)(bobBundle.identityPublicKey);
    const bobSPK = await (0, utils_1.importPublicKey)(bobBundle.signedPreKey.publicKey);
    // DH1 = IK_A * SPK_B
    const dh1 = await (0, utils_1.computeSharedSecret)(aliceIdentityPrivateKey, bobSPK);
    // DH2 = EK_A * IK_B
    const dh2 = await (0, utils_1.computeSharedSecret)(aliceEphemeralKeyPair.privateKey, bobIK);
    // DH3 = EK_A * SPK_B
    const dh3 = await (0, utils_1.computeSharedSecret)(aliceEphemeralKeyPair.privateKey, bobSPK);
    let dh4 = null;
    if (bobBundle.oneTimePreKey) {
        const bobOPK = await (0, utils_1.importPublicKey)(bobBundle.oneTimePreKey.publicKey);
        // DH4 = EK_A * OPK_B
        dh4 = await (0, utils_1.computeSharedSecret)(aliceEphemeralKeyPair.privateKey, bobOPK);
    }
    // Combine DH secrets
    const combinedLength = dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0);
    const combined = new Uint8Array(combinedLength);
    let offset = 0;
    combined.set(new Uint8Array(dh1), offset);
    offset += dh1.byteLength;
    combined.set(new Uint8Array(dh2), offset);
    offset += dh2.byteLength;
    combined.set(new Uint8Array(dh3), offset);
    offset += dh3.byteLength;
    if (dh4) {
        combined.set(new Uint8Array(dh4), offset);
    }
    const salt = new Uint8Array(32);
    const { key1: sharedMasterKey } = await (0, utils_1.hkdf)(combined.buffer, salt.buffer, 'Whisper-X3DH-Master', 64);
    return {
        sharedMasterKey,
        aliceEphemeralPublicKey: aliceEphemeralPublicBase64,
        oneTimePreKeyIdUsed: bobBundle.oneTimePreKey?.keyId,
    };
}
// X3DH Receiver (Bob) receiving initial message setup from Alice
async function receiveX3DHSession(bobIdentityPrivateKey, bobSignedPrePrivateKey, bobOneTimePrivateKeysMap, aliceIdentityPublicKey, aliceEphemeralPublicKey, oneTimePreKeyIdUsed) {
    const aliceIK = await (0, utils_1.importPublicKey)(aliceIdentityPublicKey);
    const aliceEK = await (0, utils_1.importPublicKey)(aliceEphemeralPublicKey);
    // DH1 = SPK_B * IK_A
    const dh1 = await (0, utils_1.computeSharedSecret)(bobSignedPrePrivateKey, aliceIK);
    // DH2 = IK_B * EK_A
    const dh2 = await (0, utils_1.computeSharedSecret)(bobIdentityPrivateKey, aliceEK);
    // DH3 = SPK_B * EK_A
    const dh3 = await (0, utils_1.computeSharedSecret)(bobSignedPrePrivateKey, aliceEK);
    let dh4 = null;
    if (oneTimePreKeyIdUsed !== undefined && bobOneTimePrivateKeysMap.has(oneTimePreKeyIdUsed)) {
        const bobOPKPrivate = bobOneTimePrivateKeysMap.get(oneTimePreKeyIdUsed);
        // DH4 = OPK_B * EK_A
        dh4 = await (0, utils_1.computeSharedSecret)(bobOPKPrivate, aliceEK);
    }
    const combinedLength = dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0);
    const combined = new Uint8Array(combinedLength);
    let offset = 0;
    combined.set(new Uint8Array(dh1), offset);
    offset += dh1.byteLength;
    combined.set(new Uint8Array(dh2), offset);
    offset += dh2.byteLength;
    combined.set(new Uint8Array(dh3), offset);
    offset += dh3.byteLength;
    if (dh4) {
        combined.set(new Uint8Array(dh4), offset);
    }
    const salt = new Uint8Array(32);
    const { key1: sharedMasterKey } = await (0, utils_1.hkdf)(combined.buffer, salt.buffer, 'Whisper-X3DH-Master', 64);
    return sharedMasterKey;
}
