"use strict";
// Web Crypto API helper functions for standard node & browser environments
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubtleCrypto = getSubtleCrypto;
exports.arrayBufferToBase64 = arrayBufferToBase64;
exports.base64ToArrayBuffer = base64ToArrayBuffer;
exports.stringToArrayBuffer = stringToArrayBuffer;
exports.arrayBufferToString = arrayBufferToString;
exports.generateECDHKeyPair = generateECDHKeyPair;
exports.exportPublicKey = exportPublicKey;
exports.importPublicKey = importPublicKey;
exports.exportPrivateKey = exportPrivateKey;
exports.importPrivateKey = importPrivateKey;
exports.computeSharedSecret = computeSharedSecret;
exports.hkdf = hkdf;
exports.encryptAESGCM = encryptAESGCM;
exports.decryptAESGCM = decryptAESGCM;
exports.getRandomValues = getRandomValues;
exports.generateSafetyFingerprint = generateSafetyFingerprint;
// Helper for cross-environment SubtleCrypto retrieval
function getSubtleCrypto() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        return window.crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
        return globalThis.crypto.subtle;
    }
    // Node.js fallback
    const cryptoModule = require('crypto');
    return cryptoModule.webcrypto.subtle;
}
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    if (typeof btoa !== 'undefined') {
        return btoa(binary);
    }
    return Buffer.from(bytes).toString('base64');
}
function base64ToArrayBuffer(base64) {
    if (typeof atob !== 'undefined') {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
    const buf = Buffer.from(base64, 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
function stringToArrayBuffer(str) {
    return new TextEncoder().encode(str).buffer;
}
function arrayBufferToString(buffer) {
    return new TextDecoder().decode(buffer);
}
// Generate ECDH P-256 Key Pair (for Double Ratchet DH ratchets)
async function generateECDHKeyPair() {
    const subtle = getSubtleCrypto();
    return (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']));
}
// Export Public Key to Base64 (spki)
async function exportPublicKey(key) {
    const subtle = getSubtleCrypto();
    const exported = await subtle.exportKey('spki', key);
    return arrayBufferToBase64(exported);
}
// Import Public Key from Base64 (spki)
async function importPublicKey(spkiBase64) {
    const subtle = getSubtleCrypto();
    const buffer = base64ToArrayBuffer(spkiBase64);
    return await subtle.importKey('spki', buffer, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}
// Export Private Key to Base64 (pkcs8)
async function exportPrivateKey(key) {
    const subtle = getSubtleCrypto();
    const exported = await subtle.exportKey('pkcs8', key);
    return arrayBufferToBase64(exported);
}
// Import Private Key from Base64 (pkcs8)
async function importPrivateKey(pkcs8Base64) {
    const subtle = getSubtleCrypto();
    const buffer = base64ToArrayBuffer(pkcs8Base64);
    return await subtle.importKey('pkcs8', buffer, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
}
// Perform ECDH key agreement between private Key and public Key
async function computeSharedSecret(privateKey, publicKey) {
    const subtle = getSubtleCrypto();
    return await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
}
// HKDF-SHA256 Derivation
async function hkdf(secret, salt, info, keyLength = 64) {
    const subtle = getSubtleCrypto();
    const ikmKey = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
    const derivedBits = await subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt.byteLength === 0 ? new Uint8Array(32) : salt,
        info: new TextEncoder().encode(info)
    }, ikmKey, keyLength * 8);
    const half = Math.floor(derivedBits.byteLength / 2);
    const key1 = derivedBits.slice(0, half);
    const key2 = derivedBits.slice(half);
    return { key1, key2 };
}
// AES-256-GCM Encryption
async function encryptAESGCM(plaintext, keyBuffer) {
    const subtle = getSubtleCrypto();
    const iv = getRandomValues(new Uint8Array(12)).buffer;
    const key = await subtle.importKey('raw', keyBuffer.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt']);
    const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, plaintext);
    return { ciphertext, iv };
}
// AES-256-GCM Decryption
async function decryptAESGCM(ciphertext, keyBuffer, iv) {
    const subtle = getSubtleCrypto();
    const key = await subtle.importKey('raw', keyBuffer.slice(0, 32), { name: 'AES-GCM' }, false, ['decrypt']);
    return await subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext);
}
// Secure Random Bytes
function getRandomValues(array) {
    if (typeof window !== 'undefined' && window.crypto) {
        return window.crypto.getRandomValues(array);
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
        return globalThis.crypto.getRandomValues(array);
    }
    const cryptoModule = require('crypto');
    const bytes = cryptoModule.randomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
}
// Security Number / Fingerprint calculation for Identity Key safety codes
async function generateSafetyFingerprint(identityKeyA, identityKeyB) {
    const subtle = getSubtleCrypto();
    const sorted = [identityKeyA, identityKeyB].sort().join(':');
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(sorted));
    const bytes = new Uint8Array(digest);
    let numbers = '';
    for (let i = 0; i < 6; i++) {
        const val = (bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3];
        const num = Math.abs(val) % 100000;
        numbers += num.toString().padStart(5, '0') + ' ';
    }
    return numbers.trim();
}
