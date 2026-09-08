import { EncryptedPayload } from '@chat/shared-types';
import {
  generateECDHKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  computeSharedSecret,
  hkdf,
  encryptAESGCM,
  decryptAESGCM,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString
} from './utils';

export interface SerializedRatchetState {
  dhsPrivate: string;
  dhsPublic: string;
  dhrPublic?: string | null;
  rootKey: string; // Base64
  sendingChainKey?: string | null;
  receivingChainKey?: string | null;
  sendingSequence: number;
  receivingSequence: number;
  previousChainLength: number;
  skippedMessageKeys: Record<string, string>; // "dhrPublicBase64:seq" -> messageKeyBase64
}

export class DoubleRatchetSession {
  private dhsPrivateKey!: CryptoKey;
  private dhsPublicKey!: CryptoKey;
  private dhrPublicKey: CryptoKey | null = null;
  private rootKey!: ArrayBuffer;
  private sendingChainKey: ArrayBuffer | null = null;
  private receivingChainKey: ArrayBuffer | null = null;
  private sendingSequence: number = 0;
  private receivingSequence: number = 0;
  private previousChainLength: number = 0;
  private skippedMessageKeys: Map<string, ArrayBuffer> = new Map();

  private constructor() {}

  // Initialize session as Alice (Initiator)
  public static async initAsAlice(
    sharedMasterKey: ArrayBuffer,
    bobRatchetPublicKeyBase64: string
  ): Promise<DoubleRatchetSession> {
    const session = new DoubleRatchetSession();
    const dhsPair = await generateECDHKeyPair();
    session.dhsPrivateKey = dhsPair.privateKey;
    session.dhsPublicKey = dhsPair.publicKey;
    session.dhrPublicKey = await importPublicKey(bobRatchetPublicKeyBase64);

    // Initial DH step
    const dhSecret = await computeSharedSecret(session.dhsPrivateKey, session.dhrPublicKey);
    const { key1: newRootKey, key2: sendingChainKey } = await hkdf(
      dhSecret,
      sharedMasterKey,
      'Whisper-Ratchet-Root'
    );

    session.rootKey = newRootKey;
    session.sendingChainKey = sendingChainKey;
    session.receivingChainKey = null;
    session.sendingSequence = 0;
    session.receivingSequence = 0;
    session.previousChainLength = 0;

    return session;
  }

  // Initialize session as Bob (Receiver)
  public static async initAsBob(
    sharedMasterKey: ArrayBuffer,
    bobDHKeyPair: CryptoKeyPair
  ): Promise<DoubleRatchetSession> {
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
  public async encrypt(plaintext: string): Promise<EncryptedPayload> {
    if (!this.sendingChainKey) {
      throw new Error('Sending chain key not initialized in Double Ratchet session');
    }

    // Advance symmetric sending chain ratchet
    const { key1: nextSendingChainKey, key2: messageKey } = await hkdf(
      this.sendingChainKey,
      new Uint8Array(32).buffer,
      'Whisper-Ratchet-Message'
    );
    this.sendingChainKey = nextSendingChainKey;

    const plaintextBuffer = stringToArrayBuffer(plaintext);
    const { ciphertext, iv } = await encryptAESGCM(plaintextBuffer, messageKey);

    const dhsPublicBase64 = await exportPublicKey(this.dhsPublicKey);
    const payload: EncryptedPayload = {
      ciphertext: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv),
      ephemeralPublicKey: dhsPublicBase64,
      ratchetSequence: this.sendingSequence,
      previousChainLength: this.previousChainLength,
    };

    this.sendingSequence++;
    return payload;
  }

  // Decrypt incoming payload
  public async decrypt(payload: EncryptedPayload): Promise<string> {
    const remotePublicBase64 = payload.ephemeralPublicKey;
    const ciphertextBuffer = base64ToArrayBuffer(payload.ciphertext);
    const ivBuffer = base64ToArrayBuffer(payload.iv);

    // Check if key for this sequence was skipped previously
    const skipKey = `${remotePublicBase64}:${payload.ratchetSequence}`;
    if (this.skippedMessageKeys.has(skipKey)) {
      const messageKey = this.skippedMessageKeys.get(skipKey)!;
      this.skippedMessageKeys.delete(skipKey);
      const plaintextBuffer = await decryptAESGCM(ciphertextBuffer, messageKey, ivBuffer);
      return arrayBufferToString(plaintextBuffer);
    }

    // Check if new DH ratchet step is required
    const currentDHRBase64 = this.dhrPublicKey ? await exportPublicKey(this.dhrPublicKey) : null;
    if (currentDHRBase64 !== remotePublicBase64) {
      await this.skipMessageKeys(payload.previousChainLength);
      await this.dhRatchetStep(remotePublicBase64);
    }

    await this.skipMessageKeys(payload.ratchetSequence);

    // Advance symmetric receiving chain ratchet
    if (!this.receivingChainKey) {
      throw new Error('Receiving chain key null during decryption step');
    }
    const { key1: nextReceivingChainKey, key2: messageKey } = await hkdf(
      this.receivingChainKey,
      new Uint8Array(32).buffer,
      'Whisper-Ratchet-Message'
    );
    this.receivingChainKey = nextReceivingChainKey;
    this.receivingSequence++;

    const plaintextBuffer = await decryptAESGCM(ciphertextBuffer, messageKey, ivBuffer);
    return arrayBufferToString(plaintextBuffer);
  }

  private async skipMessageKeys(untilSequence: number): Promise<void> {
    if (!this.receivingChainKey) return;
    while (this.receivingSequence < untilSequence) {
      const { key1: nextReceivingChainKey, key2: messageKey } = await hkdf(
        this.receivingChainKey,
        new Uint8Array(32).buffer,
        'Whisper-Ratchet-Message'
      );
      this.receivingChainKey = nextReceivingChainKey;
      const remotePublicBase64 = this.dhrPublicKey ? await exportPublicKey(this.dhrPublicKey) : '';
      const skipKey = `${remotePublicBase64}:${this.receivingSequence}`;
      this.skippedMessageKeys.set(skipKey, messageKey);
      this.receivingSequence++;
    }
  }

  private async dhRatchetStep(remotePublicBase64: string): Promise<void> {
    this.previousChainLength = this.sendingSequence;
    this.sendingSequence = 0;
    this.receivingSequence = 0;
    this.dhrPublicKey = await importPublicKey(remotePublicBase64);

    // DH receive step
    const dhReceiveSecret = await computeSharedSecret(this.dhsPrivateKey, this.dhrPublicKey);
    const { key1: rootKey1, key2: receivingChainKey } = await hkdf(
      dhReceiveSecret,
      this.rootKey,
      'Whisper-Ratchet-Root'
    );
    this.rootKey = rootKey1;
    this.receivingChainKey = receivingChainKey;

    // DH send step (generate new ephemeral key pair)
    const newDHSPair = await generateECDHKeyPair();
    this.dhsPrivateKey = newDHSPair.privateKey;
    this.dhsPublicKey = newDHSPair.publicKey;

    const dhSendSecret = await computeSharedSecret(this.dhsPrivateKey, this.dhrPublicKey);
    const { key1: rootKey2, key2: sendingChainKey } = await hkdf(
      dhSendSecret,
      this.rootKey,
      'Whisper-Ratchet-Root'
    );
    this.rootKey = rootKey2;
    this.sendingChainKey = sendingChainKey;
  }

  // Serialize session state for IndexedDB storage
  public async exportState(): Promise<SerializedRatchetState> {
    const dhsPrivate = await exportPrivateKey(this.dhsPrivateKey);
    const dhsPublic = await exportPublicKey(this.dhsPublicKey);
    const dhrPublic = this.dhrPublicKey ? await exportPublicKey(this.dhrPublicKey) : null;

    const skippedRecord: Record<string, string> = {};
    for (const [k, v] of this.skippedMessageKeys.entries()) {
      skippedRecord[k] = arrayBufferToBase64(v);
    }

    return {
      dhsPrivate,
      dhsPublic,
      dhrPublic,
      rootKey: arrayBufferToBase64(this.rootKey),
      sendingChainKey: this.sendingChainKey ? arrayBufferToBase64(this.sendingChainKey) : null,
      receivingChainKey: this.receivingChainKey ? arrayBufferToBase64(this.receivingChainKey) : null,
      sendingSequence: this.sendingSequence,
      receivingSequence: this.receivingSequence,
      previousChainLength: this.previousChainLength,
      skippedMessageKeys: skippedRecord,
    };
  }

  // Reconstitute session state from IndexedDB storage
  public static async importState(state: SerializedRatchetState): Promise<DoubleRatchetSession> {
    const session = new DoubleRatchetSession();
    session.dhsPrivateKey = await importPrivateKey(state.dhsPrivate);
    session.dhsPublicKey = await importPublicKey(state.dhsPublic);
    session.dhrPublicKey = state.dhrPublic ? await importPublicKey(state.dhrPublic) : null;

    session.rootKey = base64ToArrayBuffer(state.rootKey);
    session.sendingChainKey = state.sendingChainKey ? base64ToArrayBuffer(state.sendingChainKey) : null;
    session.receivingChainKey = state.receivingChainKey ? base64ToArrayBuffer(state.receivingChainKey) : null;

    session.sendingSequence = state.sendingSequence;
    session.receivingSequence = state.receivingSequence;
    session.previousChainLength = state.previousChainLength;

    session.skippedMessageKeys = new Map();
    if (state.skippedMessageKeys) {
      for (const [k, v] of Object.entries(state.skippedMessageKeys)) {
        session.skippedMessageKeys.set(k, base64ToArrayBuffer(v));
      }
    }

    return session;
  }
}
