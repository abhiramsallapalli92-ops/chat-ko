import {
  generateECDHKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  computeSharedSecret,
  hkdf,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  getSubtleCrypto
} from './utils';

export interface PreKeyBundleExport {
  identityPublicKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    publicKey: string;
  }>;
}

export interface ClientDeviceKeys {
  registrationId: number;
  identityKey: {
    privateKey: string;
    publicKey: string;
  };
  signedPreKey: {
    keyId: number;
    privateKey: string;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{
    keyId: number;
    privateKey: string;
    publicKey: string;
  }>;
}

// Generate device keys (Identity Key, Signed PreKey, One-time PreKeys)
export async function generateClientDeviceKeys(
  oneTimeKeysCount: number = 10
): Promise<ClientDeviceKeys> {
  const registrationId = Math.floor(Math.random() * 1000000);
  
  // 1. Identity Key Pair
  const identityKeyPair = await generateECDHKeyPair();
  const ikPublicBase64 = await exportPublicKey(identityKeyPair.publicKey);
  const ikPrivateBase64 = await exportPrivateKey(identityKeyPair.privateKey);

  // 2. Signed PreKey Pair
  const signedPreKeyPair = await generateECDHKeyPair();
  const spkPublicBase64 = await exportPublicKey(signedPreKeyPair.publicKey);
  const spkPrivateBase64 = await exportPrivateKey(signedPreKeyPair.privateKey);

  // Self-signature of Signed PreKey using subtle HMAC/Digest for validation
  const subtle = getSubtleCrypto();
  const sigBuffer = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(spkPublicBase64 + ikPublicBase64)
  );
  const signatureBase64 = arrayBufferToBase64(sigBuffer);

  // 3. One-Time PreKeys
  const oneTimePreKeys = [];
  for (let i = 1; i <= oneTimeKeysCount; i++) {
    const otpkPair = await generateECDHKeyPair();
    oneTimePreKeys.push({
      keyId: i,
      privateKey: await exportPrivateKey(otpkPair.privateKey),
      publicKey: await exportPublicKey(otpkPair.publicKey),
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
export function extractPublicBundle(keys: ClientDeviceKeys): PreKeyBundleExport {
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
export async function initiateX3DHSession(
  aliceIdentityPrivateKey: CryptoKey,
  bobBundle: {
    identityPublicKey: string;
    signedPreKey: { publicKey: string };
    oneTimePreKey?: { keyId: number; publicKey: string };
  }
): Promise<{
  sharedMasterKey: ArrayBuffer;
  aliceEphemeralPublicKey: string;
  oneTimePreKeyIdUsed?: number;
}> {
  // Alice generates an Ephemeral Key Pair
  const aliceEphemeralKeyPair = await generateECDHKeyPair();
  const aliceEphemeralPublicBase64 = await exportPublicKey(aliceEphemeralKeyPair.publicKey);

  const bobIK = await importPublicKey(bobBundle.identityPublicKey);
  const bobSPK = await importPublicKey(bobBundle.signedPreKey.publicKey);

  // DH1 = IK_A * SPK_B
  const dh1 = await computeSharedSecret(aliceIdentityPrivateKey, bobSPK);
  // DH2 = EK_A * IK_B
  const dh2 = await computeSharedSecret(aliceEphemeralKeyPair.privateKey, bobIK);
  // DH3 = EK_A * SPK_B
  const dh3 = await computeSharedSecret(aliceEphemeralKeyPair.privateKey, bobSPK);

  let dh4: ArrayBuffer | null = null;
  if (bobBundle.oneTimePreKey) {
    const bobOPK = await importPublicKey(bobBundle.oneTimePreKey.publicKey);
    // DH4 = EK_A * OPK_B
    dh4 = await computeSharedSecret(aliceEphemeralKeyPair.privateKey, bobOPK);
  }

  // Combine DH secrets
  const combinedLength = dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0);
  const combined = new Uint8Array(combinedLength);
  let offset = 0;

  combined.set(new Uint8Array(dh1), offset); offset += dh1.byteLength;
  combined.set(new Uint8Array(dh2), offset); offset += dh2.byteLength;
  combined.set(new Uint8Array(dh3), offset); offset += dh3.byteLength;
  if (dh4) {
    combined.set(new Uint8Array(dh4), offset);
  }

  const salt = new Uint8Array(32);
  const { key1: sharedMasterKey } = await hkdf(combined.buffer, salt.buffer, 'Whisper-X3DH-Master', 64);

  return {
    sharedMasterKey,
    aliceEphemeralPublicKey: aliceEphemeralPublicBase64,
    oneTimePreKeyIdUsed: bobBundle.oneTimePreKey?.keyId,
  };
}

// X3DH Receiver (Bob) receiving initial message setup from Alice
export async function receiveX3DHSession(
  bobIdentityPrivateKey: CryptoKey,
  bobSignedPrePrivateKey: CryptoKey,
  bobOneTimePrivateKeysMap: Map<number, CryptoKey>,
  aliceIdentityPublicKey: string,
  aliceEphemeralPublicKey: string,
  oneTimePreKeyIdUsed?: number
): Promise<ArrayBuffer> {
  const aliceIK = await importPublicKey(aliceIdentityPublicKey);
  const aliceEK = await importPublicKey(aliceEphemeralPublicKey);

  // DH1 = SPK_B * IK_A
  const dh1 = await computeSharedSecret(bobSignedPrePrivateKey, aliceIK);
  // DH2 = IK_B * EK_A
  const dh2 = await computeSharedSecret(bobIdentityPrivateKey, aliceEK);
  // DH3 = SPK_B * EK_A
  const dh3 = await computeSharedSecret(bobSignedPrePrivateKey, aliceEK);

  let dh4: ArrayBuffer | null = null;
  if (oneTimePreKeyIdUsed !== undefined && bobOneTimePrivateKeysMap.has(oneTimePreKeyIdUsed)) {
    const bobOPKPrivate = bobOneTimePrivateKeysMap.get(oneTimePreKeyIdUsed)!;
    // DH4 = OPK_B * EK_A
    dh4 = await computeSharedSecret(bobOPKPrivate, aliceEK);
  }

  const combinedLength = dh1.byteLength + dh2.byteLength + dh3.byteLength + (dh4 ? dh4.byteLength : 0);
  const combined = new Uint8Array(combinedLength);
  let offset = 0;

  combined.set(new Uint8Array(dh1), offset); offset += dh1.byteLength;
  combined.set(new Uint8Array(dh2), offset); offset += dh2.byteLength;
  combined.set(new Uint8Array(dh3), offset); offset += dh3.byteLength;
  if (dh4) {
    combined.set(new Uint8Array(dh4), offset);
  }

  const salt = new Uint8Array(32);
  const { key1: sharedMasterKey } = await hkdf(combined.buffer, salt.buffer, 'Whisper-X3DH-Master', 64);

  return sharedMasterKey;
}
