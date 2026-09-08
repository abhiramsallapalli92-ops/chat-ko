export interface EncryptedMediaResult {
    encryptedBlob: ArrayBuffer;
    ivBase64: string;
    symmetricKeyBase64: string;
    mimeType: string;
}
export declare function encryptMediaFile(fileBuffer: ArrayBuffer, mimeType: string): Promise<EncryptedMediaResult>;
export declare function decryptMediaFile(encryptedBlob: ArrayBuffer, symmetricKeyBase64: string, ivBase64: string): Promise<ArrayBuffer>;
