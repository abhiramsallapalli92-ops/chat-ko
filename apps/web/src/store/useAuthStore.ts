import { create } from 'zustand';
import { UserProfile } from '@chat/shared-types';
import {
  generateClientDeviceKeys,
  extractPublicBundle,
  ClientDeviceKeys
} from '@chat/crypto';
import { db, LocalDeviceKeysRecord } from '../db/indexeddb';
import { firestoreDB } from '../lib/firebase';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { compressImage } from '../lib/imageCompressor';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  deviceKeys: ClientDeviceKeys | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: UserProfile) => Promise<void>;
  updateUser: (updatedUser: Partial<UserProfile & { blockedUserIds?: string[] }>) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeKeys: () => Promise<ClientDeviceKeys>;
  loadSavedAuth: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  deviceKeys: null,
  isAuthenticated: false,

  setAuth: async (token: string, user: UserProfile) => {
    localStorage.setItem('whisper_jwt_token', token);
    localStorage.setItem('whisper_user', JSON.stringify(user));
    
    // Initialize or load client E2EE keys
    let keys = await get().initializeKeys();

    set({ token, user, deviceKeys: keys, isAuthenticated: true });

    // Register User document in Firestore
    try {
      const userRef = doc(firestoreDB, 'users', user.id);
      await setDoc(userRef, {
        id: user.id,
        phoneNumber: user.phoneNumber,
        name: user.name || `User ${user.phoneNumber.slice(-4)}`,
        avatarUrl: user.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.phoneNumber}`,
        bio: user.bio || 'Hey there! I am using Chat-Ko E2EE.',
        email: (user as any).email || '',
        status: 'ONLINE',
        lastSeen: new Date().toISOString(),
        createdAt: user.createdAt || new Date().toISOString(),
      }, { merge: true });

      // Save E2EE Public Key Bundle in Firestore keyBundles collection
      const publicBundle = extractPublicBundle(keys);
      const keyBundleRef = doc(firestoreDB, 'keyBundles', user.id);
      await setDoc(keyBundleRef, {
        userId: user.id,
        deviceId: `web-device-${user.id}`,
        registrationId: keys.registrationId,
        identityPublicKey: publicBundle.identityPublicKey,
        signedPreKey: publicBundle.signedPreKey,
        oneTimePreKeys: publicBundle.oneTimePreKeys,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.error('Failed to write user profile or key bundle to Firestore:', err);
    }
  },

  updateUser: async (updatedUser: Partial<UserProfile & { blockedUserIds?: string[] }>) => {
    const current = get().user;
    if (!current) return;

    let finalAvatarUrl = updatedUser.avatarUrl;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:image')) {
      finalAvatarUrl = await compressImage(finalAvatarUrl, 250, 0.85);
    }

    const newUser = {
      ...current,
      ...updatedUser,
      ...(finalAvatarUrl !== undefined && { avatarUrl: finalAvatarUrl }),
    };

    localStorage.setItem('whisper_user', JSON.stringify(newUser));
    set({ user: newUser });

    try {
      const userRef = doc(firestoreDB, 'users', current.id);
      await setDoc(
        userRef,
        {
          id: current.id,
          name: newUser.name,
          avatarUrl: newUser.avatarUrl,
          bio: newUser.bio,
          phoneNumber: newUser.phoneNumber || '',
          email: (newUser as any).email || '',
          updatedAt: new Date().toISOString(),
          ...((newUser as any).blockedUserIds !== undefined && {
            blockedUserIds: (newUser as any).blockedUserIds,
          }),
        },
        { merge: true }
      );
    } catch (err: any) {
      console.error('Firestore user update error:', err);
    }
  },

  blockUser: async (targetUserId: string) => {
    const current = get().user;
    if (!current) return;

    const currentBlocked = (current as any).blockedUserIds || [];
    if (currentBlocked.includes(targetUserId)) return;

    const updatedBlocked = [...currentBlocked, targetUserId];
    const newUser = { ...current, blockedUserIds: updatedBlocked };

    localStorage.setItem('whisper_user', JSON.stringify(newUser));
    set({ user: newUser as any });

    const userRef = doc(firestoreDB, 'users', current.id);
    setDoc(userRef, { blockedUserIds: updatedBlocked }, { merge: true }).catch(() => {});
  },

  unblockUser: async (targetUserId: string) => {
    const current = get().user;
    if (!current) return;

    const currentBlocked = (current as any).blockedUserIds || [];
    const updatedBlocked = currentBlocked.filter((id: string) => id !== targetUserId);
    const newUser = { ...current, blockedUserIds: updatedBlocked };

    localStorage.setItem('whisper_user', JSON.stringify(newUser));
    set({ user: newUser as any });

    const userRef = doc(firestoreDB, 'users', current.id);
    setDoc(userRef, { blockedUserIds: updatedBlocked }, { merge: true }).catch(() => {});
  },

  initializeKeys: async (): Promise<ClientDeviceKeys> => {
    const existing = await db.deviceKeys.get('current');
    if (existing) {
      const keys: ClientDeviceKeys = {
        registrationId: existing.registrationId,
        identityKey: {
          privateKey: existing.identityPrivateKey,
          publicKey: existing.identityPublicKey,
        },
        signedPreKey: {
          keyId: existing.signedPreKeyId,
          privateKey: existing.signedPreKeyPrivate,
          publicKey: existing.signedPreKeyPublic,
          signature: existing.signedPreKeySig,
        },
        oneTimePreKeys: existing.oneTimePreKeys,
      };
      set({ deviceKeys: keys });
      return keys;
    }

    // Generate fresh key bundle
    const newKeys = await generateClientDeviceKeys(15);
    const record: LocalDeviceKeysRecord = {
      id: 'current',
      registrationId: newKeys.registrationId,
      identityPrivateKey: newKeys.identityKey.privateKey,
      identityPublicKey: newKeys.identityKey.publicKey,
      signedPreKeyPrivate: newKeys.signedPreKey.privateKey,
      signedPreKeyPublic: newKeys.signedPreKey.publicKey,
      signedPreKeyId: newKeys.signedPreKey.keyId,
      signedPreKeySig: newKeys.signedPreKey.signature,
      oneTimePreKeys: newKeys.oneTimePreKeys,
    };
    await db.deviceKeys.put(record);
    set({ deviceKeys: newKeys });
    return newKeys;
  },

  loadSavedAuth: async (): Promise<boolean> => {
    const token = localStorage.getItem('whisper_jwt_token');
    const userStr = localStorage.getItem('whisper_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        const keys = await get().initializeKeys();
        set({ token, user, deviceKeys: keys, isAuthenticated: true });
        return true;
      } catch (e) {
        localStorage.removeItem('whisper_jwt_token');
        localStorage.removeItem('whisper_user');
      }
    }
    return false;
  },

  logout: async () => {
    const current = get().user;
    if (current) {
      try {
        const userRef = doc(firestoreDB, 'users', current.id);
        await updateDoc(userRef, {
          status: 'OFFLINE',
          lastSeen: new Date().toISOString(),
        });
      } catch (e) {}
    }
    localStorage.removeItem('whisper_jwt_token');
    localStorage.removeItem('whisper_user');
    await db.delete(); // Clear local IndexedDB stores safely on logout
    set({ token: null, user: null, deviceKeys: null, isAuthenticated: false });
  },
}));
