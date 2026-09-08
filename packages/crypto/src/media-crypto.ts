import {
  encryptAESGCM,
  decryptAESGCM,
  getRandomValues,
  arrayBufferToBase64,
  base64ToArrayBuffer
} from './utils';

export interface EncryptedMediaResult {
  encryptedBlob: ArrayBuffer;
  ivBase64: string;
  symmetricKeyBase64: string;
  mimeType: string;
}

// Encrypt file ArrayBuffer with fresh per-file AES-256 symmetric key
export async function encryptMediaFile(
  fileBuffer: ArrayBuffer,
  mimeType: string
): Promise<EncryptedMediaResult> {
  const keyBytes = getRandomValues(new Uint8Array(32));
  const { ciphertext, iv } = await encryptAESGCM(fileBuffer, keyBytes.buffer);

  return {
    encryptedBlob: ciphertext,
    ivBase64: arrayBufferToBase64(iv),
    symmetricKeyBase64: arrayBufferToBase64(keyBytes.buffer),
    mimeType,
  };
}

// Decrypt media file ArrayBuffer using per-file symmetric key
export async function decryptMediaFile(
  encryptedBlob: ArrayBuffer,
  symmetricKeyBase64: string,
  ivBase64: string
): Promise<ArrayBuffer> {
  const keyBuffer = base64ToArrayBuffer(symmetricKeyBase64);
  const ivBuffer = base64ToArrayBuffer(ivBase64);

  return await decryptAESGCM(encryptedBlob, keyBuffer, ivBuffer);
}
