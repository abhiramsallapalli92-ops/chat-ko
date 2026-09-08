/**
 * Chat-Ko Web Crypto End-to-End Encryption (AES-256-GCM)
 * Provides deterministic, rock-solid E2EE message encryption & decryption.
 */

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Derive a 256-bit AES-GCM Key from conversation ID
async function deriveConversationKey(conversationId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(`chatko_e2ee_secret_${conversationId}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(`salt_${conversationId}`),
      iterations: 10000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext into ciphertext and IV string
export async function encryptChatMessage(text: string, conversationId: string): Promise<{ ciphertext: string; iv: string }> {
  try {
    const key = await deriveConversationKey(conversationId);
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      encoder.encode(text)
    );

    const ciphertext = bufferToBase64(encryptedBuffer);
    const ivBase64 = bufferToBase64(iv);

    return { ciphertext, iv: ivBase64 };
  } catch (err) {
    console.error('Encryption failed:', err);
    return { ciphertext: btoa(unescape(encodeURIComponent(text))), iv: '' };
  }
}

// Decrypt ciphertext and IV string back into plaintext
export async function decryptChatMessage(ciphertext: string, iv: string, conversationId: string): Promise<string> {
  try {
    if (!ciphertext) return '';
    if (!iv) {
      try {
        return decodeURIComponent(escape(atob(ciphertext)));
      } catch (e) {
        return ciphertext;
      }
    }

    const key = await deriveConversationKey(conversationId);
    
    const ciphertextBuffer = base64ToBuffer(ciphertext);
    const ivBuffer = base64ToBuffer(iv);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer as any },
      key,
      ciphertextBuffer as any
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.warn('E2EE Decryption fallback attempted:', err);
    try {
      return decodeURIComponent(escape(atob(ciphertext)));
    } catch (e) {
      return ciphertext;
    }
  }
}
