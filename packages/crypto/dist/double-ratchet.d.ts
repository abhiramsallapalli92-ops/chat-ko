import { EncryptedPayload } from '@chat/shared-types';
export interface SerializedRatchetState {
    dhsPrivate: string;
    dhsPublic: string;
    dhrPublic?: string | null;
    rootKey: string;
    sendingChainKey?: string | null;
    receivingChainKey?: string | null;
    sendingSequence: number;
    receivingSequence: number;
    previousChainLength: number;
    skippedMessageKeys: Record<string, string>;
}
export declare class DoubleRatchetSession {
    private dhsPrivateKey;
    private dhsPublicKey;
    private dhrPublicKey;
    private rootKey;
    private sendingChainKey;
    private receivingChainKey;
    private sendingSequence;
    private receivingSequence;
    private previousChainLength;
    private skippedMessageKeys;
    private constructor();
    static initAsAlice(sharedMasterKey: ArrayBuffer, bobRatchetPublicKeyBase64: string): Promise<DoubleRatchetSession>;
    static initAsBob(sharedMasterKey: ArrayBuffer, bobDHKeyPair: CryptoKeyPair): Promise<DoubleRatchetSession>;
    encrypt(plaintext: string): Promise<EncryptedPayload>;
    decrypt(payload: EncryptedPayload): Promise<string>;
    private skipMessageKeys;
    private dhRatchetStep;
    exportState(): Promise<SerializedRatchetState>;
    static importState(state: SerializedRatchetState): Promise<DoubleRatchetSession>;
}
