// Web Crypto API helper functions for standard node & browser environments

// Helper for cross-environment SubtleCrypto retrieval
export function getSubtleCrypto(): SubtleCrypto {
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

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
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

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
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

export function stringToArrayBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

export function arrayBufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

// Generate ECDH P-256 Key Pair (for Double Ratchet DH ratchets)
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  const subtle = getSubtleCrypto();
  return (await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )) as CryptoKeyPair;
}

// Export Public Key to Base64 (spki)
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const subtle = getSubtleCrypto();
  const exported = await subtle.exportKey('spki', key);
  return arrayBufferToBase64(exported);
}

// Import Public Key from Base64 (spki)
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const buffer = base64ToArrayBuffer(spkiBase64);
  return await subtle.importKey(
    'spki',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// Export Private Key to Base64 (pkcs8)
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const subtle = getSubtleCrypto();
  const exported = await subtle.exportKey('pkcs8', key);
  return arrayBufferToBase64(exported);
}

// Import Private Key from Base64 (pkcs8)
export async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const buffer = base64ToArrayBuffer(pkcs8Base64);
  return await subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// Perform ECDH key agreement between private Key and public Key
export async function computeSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<ArrayBuffer> {
  const subtle = getSubtleCrypto();
  return await subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
}

// HKDF-SHA256 Derivation
export async function hkdf(
  secret: ArrayBuffer,
  salt: ArrayBuffer,
  info: string,
  keyLength: number = 64
): Promise<{ key1: ArrayBuffer; key2: ArrayBuffer }> {
  const subtle = getSubtleCrypto();
  const ikmKey = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  
  const derivedBits = await subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt.byteLength === 0 ? new Uint8Array(32) : salt,
      info: new TextEncoder().encode(info)
    },
    ikmKey,
    keyLength * 8
  );

  const half = Math.floor(derivedBits.byteLength / 2);
  const key1 = derivedBits.slice(0, half);
  const key2 = derivedBits.slice(half);

  return { key1, key2 };
}

// AES-256-GCM Encryption
export async function encryptAESGCM(
  plaintext: ArrayBuffer,
  keyBuffer: ArrayBuffer
): Promise<{ ciphertext: ArrayBuffer; iv: ArrayBuffer }> {
  const subtle = getSubtleCrypto();
  const iv = getRandomValues(new Uint8Array(12)).buffer;
  
  const key = await subtle.importKey(
    'raw',
    keyBuffer.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    plaintext
  );

  return { ciphertext, iv };
}

// AES-256-GCM Decryption
export async function decryptAESGCM(
  ciphertext: ArrayBuffer,
  keyBuffer: ArrayBuffer,
  iv: ArrayBuffer
): Promise<ArrayBuffer> {
  const subtle = getSubtleCrypto();
  const key = await subtle.importKey(
    'raw',
    keyBuffer.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  return await subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    ciphertext
  );
}

// Secure Random Bytes
export function getRandomValues<T extends ArrayBufferView>(array: T): T {
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
export async function generateSafetyFingerprint(
  identityKeyA: string,
  identityKeyB: string
): Promise<string> {
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
