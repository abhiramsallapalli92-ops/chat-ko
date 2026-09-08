import {
  generateClientDeviceKeys,
  extractPublicBundle,
  initiateX3DHSession,
  receiveX3DHSession,
  DoubleRatchetSession,
  generateSafetyFingerprint,
  importPrivateKey,
  importPublicKey,
  generateECDHKeyPair,
  encryptMediaFile,
  decryptMediaFile
} from '../src';

describe('Crypto Package - E2EE Signal Protocol Engine', () => {
  it('should generate client device key bundle and extract public prekey bundle', async () => {
    const keys = await generateClientDeviceKeys(5);
    expect(keys.registrationId).toBeGreaterThan(0);
    expect(keys.identityKey.publicKey).toBeDefined();
    expect(keys.identityKey.privateKey).toBeDefined();
    expect(keys.signedPreKey.publicKey).toBeDefined();
    expect(keys.oneTimePreKeys.length).toBe(5);

    const publicBundle = extractPublicBundle(keys);
    expect(publicBundle.identityPublicKey).toBe(keys.identityKey.publicKey);
    expect(publicBundle.oneTimePreKeys.length).toBe(5);
  });

  it('should establish X3DH session between Alice and Bob and match derived master key', async () => {
    const aliceKeys = await generateClientDeviceKeys(1);
    const bobKeys = await generateClientDeviceKeys(1);

    const bobPublicBundle = extractPublicBundle(bobKeys);

    const aliceIKPrivate = await importPrivateKey(aliceKeys.identityKey.privateKey);
    const bobIKPrivate = await importPrivateKey(bobKeys.identityKey.privateKey);
    const bobSPKPrivate = await importPrivateKey(bobKeys.signedPreKey.privateKey);

    const bobOPKey = bobKeys.oneTimePreKeys[0];
    const bobOPKPrivate = await importPrivateKey(bobOPKey.privateKey);
    const bobOPKMap = new Map([[bobOPKey.keyId, bobOPKPrivate]]);

    // Alice initiates
    const aliceResult = await initiateX3DHSession(aliceIKPrivate, {
      identityPublicKey: bobPublicBundle.identityPublicKey,
      signedPreKey: bobPublicBundle.signedPreKey,
      oneTimePreKey: bobPublicBundle.oneTimePreKeys[0],
    });

    // Bob receives
    const bobMasterKey = await receiveX3DHSession(
      bobIKPrivate,
      bobSPKPrivate,
      bobOPKMap,
      aliceKeys.identityKey.publicKey,
      aliceResult.aliceEphemeralPublicKey,
      aliceResult.oneTimePreKeyIdUsed
    );

    const aliceMasterHex = Buffer.from(aliceResult.sharedMasterKey).toString('hex');
    const bobMasterHex = Buffer.from(bobMasterKey).toString('hex');

    expect(aliceMasterHex).toBe(bobMasterHex);
  });

  it('should perform Double Ratchet encrypt & decrypt back and forth with key rotation', async () => {
    const aliceKeys = await generateClientDeviceKeys(1);
    const bobKeys = await generateClientDeviceKeys(1);

    const bobPublicBundle = extractPublicBundle(bobKeys);
    const aliceIKPrivate = await importPrivateKey(aliceKeys.identityKey.privateKey);
    const bobIKPrivate = await importPrivateKey(bobKeys.identityKey.privateKey);
    const bobSPKPrivate = await importPrivateKey(bobKeys.signedPreKey.privateKey);

    const bobDHKeyPair = {
      privateKey: bobSPKPrivate,
      publicKey: await importPublicKey(bobKeys.signedPreKey.publicKey)
    };

    const aliceResult = await initiateX3DHSession(aliceIKPrivate, {
      identityPublicKey: bobPublicBundle.identityPublicKey,
      signedPreKey: bobPublicBundle.signedPreKey,
    });

    const bobMasterKey = await receiveX3DHSession(
      bobIKPrivate,
      bobSPKPrivate,
      new Map(),
      aliceKeys.identityKey.publicKey,
      aliceResult.aliceEphemeralPublicKey
    );

    // Initialize Sessions
    const aliceSession = await DoubleRatchetSession.initAsAlice(
      aliceResult.sharedMasterKey,
      bobKeys.signedPreKey.publicKey
    );

    const bobSession = await DoubleRatchetSession.initAsBob(
      bobMasterKey,
      bobDHKeyPair
    );

    // 1. Alice sends to Bob
    const msg1 = "Hello Bob! This is an E2EE secret message.";
    const encrypted1 = await aliceSession.encrypt(msg1);
    const decrypted1 = await bobSession.decrypt(encrypted1);
    expect(decrypted1).toBe(msg1);

    // 2. Bob replies to Alice
    const msg2 = "Hey Alice! I received your encrypted message.";
    const encrypted2 = await bobSession.encrypt(msg2);
    const decrypted2 = await aliceSession.decrypt(encrypted2);
    expect(decrypted2).toBe(msg2);
  });

  it('should serialize and restore Double Ratchet session state correctly', async () => {
    const aliceKeys = await generateClientDeviceKeys(1);
    const bobKeys = await generateClientDeviceKeys(1);
    const aliceIKPrivate = await importPrivateKey(aliceKeys.identityKey.privateKey);
    const bobIKPrivate = await importPrivateKey(bobKeys.identityKey.privateKey);
    const bobSPKPrivate = await importPrivateKey(bobKeys.signedPreKey.privateKey);

    const aliceResult = await initiateX3DHSession(aliceIKPrivate, {
      identityPublicKey: bobKeys.identityKey.publicKey,
      signedPreKey: bobKeys.signedPreKey,
    });

    const bobMasterKey = await receiveX3DHSession(
      bobIKPrivate,
      bobSPKPrivate,
      new Map(),
      aliceKeys.identityKey.publicKey,
      aliceResult.aliceEphemeralPublicKey
    );

    const aliceSession = await DoubleRatchetSession.initAsAlice(
      aliceResult.sharedMasterKey,
      bobKeys.signedPreKey.publicKey
    );

    const exportedState = await aliceSession.exportState();
    const restoredAliceSession = await DoubleRatchetSession.importState(exportedState);

    const msg = "Testing restored session state persistence";
    const encrypted = await restoredAliceSession.encrypt(msg);
    expect(encrypted.ciphertext).toBeDefined();
  });

  it('should calculate identical safety fingerprint regardless of key order', async () => {
    const keyA = "Key_A_Base64_String_Mock";
    const keyB = "Key_B_Base64_String_Mock";

    const fp1 = await generateSafetyFingerprint(keyA, keyB);
    const fp2 = await generateSafetyFingerprint(keyB, keyA);

    expect(fp1).toBe(fp2);
    expect(fp1.split(' ').length).toBe(6);
  });

  it('should encrypt and decrypt media file buffer correctly', async () => {
    const sampleText = "Image data binary payload content mock";
    const buffer = new TextEncoder().encode(sampleText).buffer;

    const encrypted = await encryptMediaFile(buffer, 'image/png');
    expect(encrypted.encryptedBlob.byteLength).toBeGreaterThan(0);
    expect(encrypted.ivBase64).toBeDefined();
    expect(encrypted.symmetricKeyBase64).toBeDefined();

    const decrypted = await decryptMediaFile(
      encrypted.encryptedBlob,
      encrypted.symmetricKeyBase64,
      encrypted.ivBase64
    );

    const decryptedText = new TextDecoder().decode(decrypted);
    expect(decryptedText).toBe(sampleText);
  });
});
