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
export declare function generateClientDeviceKeys(oneTimeKeysCount?: number): Promise<ClientDeviceKeys>;
export declare function extractPublicBundle(keys: ClientDeviceKeys): PreKeyBundleExport;
export declare function initiateX3DHSession(aliceIdentityPrivateKey: CryptoKey, bobBundle: {
    identityPublicKey: string;
    signedPreKey: {
        publicKey: string;
    };
    oneTimePreKey?: {
        keyId: number;
        publicKey: string;
    };
}): Promise<{
    sharedMasterKey: ArrayBuffer;
    aliceEphemeralPublicKey: string;
    oneTimePreKeyIdUsed?: number;
}>;
export declare function receiveX3DHSession(bobIdentityPrivateKey: CryptoKey, bobSignedPrePrivateKey: CryptoKey, bobOneTimePrivateKeysMap: Map<number, CryptoKey>, aliceIdentityPublicKey: string, aliceEphemeralPublicKey: string, oneTimePreKeyIdUsed?: number): Promise<ArrayBuffer>;
