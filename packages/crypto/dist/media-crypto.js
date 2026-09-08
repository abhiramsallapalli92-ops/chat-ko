"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptMediaFile = encryptMediaFile;
exports.decryptMediaFile = decryptMediaFile;
const utils_1 = require("./utils");
// Encrypt file ArrayBuffer with fresh per-file AES-256 symmetric key
async function encryptMediaFile(fileBuffer, mimeType) {
    const keyBytes = (0, utils_1.getRandomValues)(new Uint8Array(32));
    const { ciphertext, iv } = await (0, utils_1.encryptAESGCM)(fileBuffer, keyBytes.buffer);
    return {
        encryptedBlob: ciphertext,
        ivBase64: (0, utils_1.arrayBufferToBase64)(iv),
        symmetricKeyBase64: (0, utils_1.arrayBufferToBase64)(keyBytes.buffer),
        mimeType,
    };
}
// Decrypt media file ArrayBuffer using per-file symmetric key
async function decryptMediaFile(encryptedBlob, symmetricKeyBase64, ivBase64) {
    const keyBuffer = (0, utils_1.base64ToArrayBuffer)(symmetricKeyBase64);
    const ivBuffer = (0, utils_1.base64ToArrayBuffer)(ivBase64);
    return await (0, utils_1.decryptAESGCM)(encryptedBlob, keyBuffer, ivBuffer);
}
