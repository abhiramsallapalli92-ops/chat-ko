export declare function getSubtleCrypto(): SubtleCrypto;
export declare function arrayBufferToBase64(buffer: ArrayBuffer): string;
export declare function base64ToArrayBuffer(base64: string): ArrayBuffer;
export declare function stringToArrayBuffer(str: string): ArrayBuffer;
export declare function arrayBufferToString(buffer: ArrayBuffer): string;
export declare function generateECDHKeyPair(): Promise<CryptoKeyPair>;
export declare function exportPublicKey(key: CryptoKey): Promise<string>;
export declare function importPublicKey(spkiBase64: string): Promise<CryptoKey>;
export declare function exportPrivateKey(key: CryptoKey): Promise<string>;
export declare function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey>;
export declare function computeSharedSecret(privateKey: CryptoKey, publicKey: CryptoKey): Promise<ArrayBuffer>;
export declare function hkdf(secret: ArrayBuffer, salt: ArrayBuffer, info: string, keyLength?: number): Promise<{
    key1: ArrayBuffer;
    key2: ArrayBuffer;
}>;
export declare function encryptAESGCM(plaintext: ArrayBuffer, keyBuffer: ArrayBuffer): Promise<{
    ciphertext: ArrayBuffer;
    iv: ArrayBuffer;
}>;
export declare function decryptAESGCM(ciphertext: ArrayBuffer, keyBuffer: ArrayBuffer, iv: ArrayBuffer): Promise<ArrayBuffer>;
export declare function getRandomValues<T extends ArrayBufferView>(array: T): T;
export declare function generateSafetyFingerprint(identityKeyA: string, identityKeyB: string): Promise<string>;
