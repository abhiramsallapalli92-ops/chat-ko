import { create } from 'zustand';
import { ConversationDTO, MessageDTO, UserProfile, EncryptedPayload } from '@chat/shared-types';
import {
  DoubleRatchetSession,
  initiateX3DHSession,
  receiveX3DHSession,
  importPrivateKey,
  importPublicKey
} from '@chat/crypto';
import { db, LocalMessageRecord } from '../db/indexeddb';
import { useAuthStore } from './useAuthStore';
import { firestoreDB } from '../lib/firebase';
import { playSentSound, playReceivedSound } from '../lib/soundEffects';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc
} from 'firebase/firestore';

export interface CallSignal {
  id: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  recipientId: string;
  callType: 'AUDIO' | 'VIDEO';
  status: 'OFFER' | 'CONNECTED' | 'ENDED';
}

export interface MessageRequestDTO {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderPhone: string;
  recipientId: string;
  recipientName: string;
  recipientAvatar: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  conversations: ConversationDTO[];
  activeConversationId: string | null;
  messages: Record<string, LocalMessageRecord[]>;
  typingStatus: Record<string, boolean>;
  remoteTypingStatus: Record<string, boolean>; // other participant's typing state from Firestore
  userPresence: Record<string, { status: string; lastSeen?: string; blockedUserIds?: string[]; name?: string; avatarUrl?: string }>;
  activeSafetyVerifyContact: UserProfile | null;
  activeCallSignal: CallSignal | null;
  messageRequests: MessageRequestDTO[];
  unsubscribers: Array<() => void>;

  connectSocket: () => void;
  disconnectSocket: () => void;
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string, pushHistory?: boolean) => Promise<void>;
  sendMessage: (text: string, replyToId?: string, messageType?: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO_NOTE', mediaUrl?: string, frameStyle?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  startCall: (recipientUser: UserProfile, callType: 'AUDIO' | 'VIDEO') => Promise<void>;
  acceptCall: () => Promise<void>;
  endCall: () => Promise<void>;
  sendRequest: (targetUser: UserProfile) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  createConversation: (recipientPhoneNumber: string) => Promise<ConversationDTO>;
  setTyping: (isTyping: boolean) => void;
  setSafetyVerifyContact: (contact: UserProfile | null) => void;
  getOrCreateRatchetSession: (conversationId: string, recipientUser: UserProfile) => Promise<DoubleRatchetSession>;
  getOrCreateRatchetSessionAsBob: (conversationId: string, payload: EncryptedPayload) => Promise<DoubleRatchetSession>;
}

// In-memory active Double Ratchet sessions cache
const sessionCache = new Map<string, DoubleRatchetSession>();
// Pending X3DH handshakes for initial outgoing messages
interface PendingX3DHHandshake {
  x3dhEphemeralPublicKey: string;
  senderIdentityPublicKey: string;
  oneTimePreKeyIdUsed?: number;
}
const pendingX3DHHandshakes = new Map<string, PendingX3DHHandshake>();
// In-memory user profile cache to avoid re-fetching on every snapshot
const userProfileCache = new Map<string, UserProfile>();
// Track active message unsubscriber to prevent memory/listener leaks on chat switch
let activeMessageUnsub: (() => void) | null = null;
// Typing auto-clear timeouts per conversation
const typingClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Helper: treat a presence entry as ONLINE only if lastSeen is within 55 seconds
export function isUserOnline(presence: { status: string; lastSeen?: string } | undefined): boolean {
  if (!presence || presence.status !== 'ONLINE') return false;
  if (!presence.lastSeen) return false;
  return Date.now() - new Date(presence.lastSeen).getTime() < 55_000;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingStatus: {},
  remoteTypingStatus: {},
  userPresence: {},
  activeSafetyVerifyContact: null,
  activeCallSignal: null,
  messageRequests: [],
  unsubscribers: [],

  setSafetyVerifyContact: (contact) => set({ activeSafetyVerifyContact: contact }),

  // Set up Firestore real-time onSnapshot listeners
  connectSocket: () => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    // Start presence heartbeat
    useAuthStore.getState().startPresenceHeartbeat();

    // Clean up existing listeners if any
    get().unsubscribers.forEach((unsub) => unsub());
    const newUnsubs: Array<() => void> = [];

    // 1. Subscribe to conversations where user is participant
    const convsQuery = query(
      collection(firestoreDB, 'conversations'),
      where('participantIds', 'array-contains', user.id)
    );

    const unsubConvs = onSnapshot(convsQuery, async (snapshot: any) => {
      const convList: ConversationDTO[] = [];

      // Collect all unique participant IDs across all conversations
      const allParticipantIds = new Set<string>();
      const docsData: Array<{ id: string; data: any }> = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        docsData.push({ id: docSnap.id, data });
        (data.participantIds || []).forEach((pId: string) => allParticipantIds.add(pId));
      }

      // Fetch only unknown profiles in parallel
      const unknownIds = Array.from(allParticipantIds).filter(id => !userProfileCache.has(id));
      if (unknownIds.length > 0) {
        const fetches = unknownIds.map(async (pId) => {
          try {
            const userDoc = await getDoc(doc(firestoreDB, 'users', pId));
            if (userDoc.exists()) {
              userProfileCache.set(pId, userDoc.data() as UserProfile);
            }
          } catch {}
        });
        await Promise.all(fetches);
      }

      // Build conversation list using cached profiles
      const { user: currentUser } = useAuthStore.getState();
      const remoteTypingUpdate: Record<string, boolean> = { ...get().remoteTypingStatus };

      for (const { id: docId, data } of docsData) {
        const participantIds: string[] = data.participantIds || [];
        const participants: UserProfile[] = participantIds
          .map(pId => userProfileCache.get(pId))
          .filter(Boolean) as UserProfile[];

        convList.push({
          id: docId,
          isGroup: data.isGroup || false,
          name: data.name || null,
          groupAvatar: data.groupAvatar || null,
          participants,
          lastMessage: data.lastMessage || null,
          updatedAt: data.updatedAt || new Date().toISOString(),
        });

        // Extract OTHER participant's typing status from Firestore
        if (data.typingUsers && currentUser) {
          const otherParticipantId = participantIds.find(id => id !== currentUser.id);
          if (otherParticipantId) {
            remoteTypingUpdate[docId] = data.typingUsers[otherParticipantId] === true;
          }
        }
      }

      // Sort by most recent activity descending so newest chat is always first
      convList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      set({ conversations: convList, remoteTypingStatus: remoteTypingUpdate });
      db.conversations.bulkPut(convList).catch(() => {});
    });
    newUnsubs.push(unsubConvs);

    // 2. Subscribe to Users presence & block status updates
    const usersQuery = query(collection(firestoreDB, 'users'));
    const unsubUsers = onSnapshot(usersQuery, (snapshot: any) => {
      const presenceMap: Record<string, { status: string; lastSeen?: string; blockedUserIds?: string[]; name?: string; avatarUrl?: string }> = {};
      snapshot.docs.forEach((d: any) => {
        const u = d.data();
        userProfileCache.set(d.id, { id: d.id, ...u } as UserProfile);
        presenceMap[d.id] = {
          status: u.status || 'OFFLINE',
          lastSeen: u.lastSeen,
          blockedUserIds: u.blockedUserIds || [],
          name: u.name,
          avatarUrl: u.avatarUrl,
        };
      });
      set({ userPresence: presenceMap });
    });
    newUnsubs.push(unsubUsers);

    // 3. Subscribe to incoming calls for current user
    const incomingCallsQuery = query(
      collection(firestoreDB, 'calls'),
      where('recipientId', '==', user.id)
    );
    const unsubIncomingCalls = onSnapshot(incomingCallsQuery, (snapshot: any) => {
      const myBlocked = (user as any).blockedUserIds || [];
      const { userPresence } = get();

      snapshot.docChanges().forEach((change: any) => {
        const rawData = change.doc.data();
        const data = { id: change.doc.id, ...rawData } as CallSignal & { createdAt?: string };
        const callerBlockedList = userPresence[data.callerId]?.blockedUserIds || [];

        // Auto-end stale call signals older than 45 seconds
        if (data.createdAt && data.status !== 'ENDED') {
          const callAgeMs = Date.now() - new Date(data.createdAt).getTime();
          if (callAgeMs > 45000) {
            updateDoc(doc(firestoreDB, 'calls', data.id), { status: 'ENDED' }).catch(() => {});
            const currentCall = get().activeCallSignal;
            if (currentCall && currentCall.id === data.id) {
              set({ activeCallSignal: null });
            }
            return;
          }
        }

        // If caller is blocked by me OR caller blocked me: auto drop call silently
        if (myBlocked.includes(data.callerId) || callerBlockedList.includes(user.id)) {
          if (data.status === 'OFFER') {
            updateDoc(doc(firestoreDB, 'calls', data.id), { status: 'ENDED' }).catch(() => {});
          }
          return;
        }

        if (change.type === 'added' || change.type === 'modified') {
          if (data.status === 'OFFER' || data.status === 'CONNECTED') {
            set({ activeCallSignal: data });
          } else if (data.status === 'ENDED') {
            const currentCall = get().activeCallSignal;
            if (currentCall && currentCall.id === data.id) {
              set({ activeCallSignal: null });
            }
          }
        } else if (change.type === 'removed') {
          const currentCall = get().activeCallSignal;
          if (currentCall && currentCall.id === data.id) {
            set({ activeCallSignal: null });
          }
        }
      });
    });
    newUnsubs.push(unsubIncomingCalls);

    // 4. Subscribe to outgoing calls for current user
    const outgoingCallsQuery = query(
      collection(firestoreDB, 'calls'),
      where('callerId', '==', user.id)
    );
    const unsubOutgoingCalls = onSnapshot(outgoingCallsQuery, (snapshot: any) => {
      snapshot.docChanges().forEach((change: any) => {
        const rawData = change.doc.data();
        const data = { id: change.doc.id, ...rawData } as CallSignal & { createdAt?: string };

        // Auto-end stale call signals older than 45 seconds
        if (data.createdAt && data.status !== 'ENDED') {
          const callAgeMs = Date.now() - new Date(data.createdAt).getTime();
          if (callAgeMs > 45000) {
            updateDoc(doc(firestoreDB, 'calls', data.id), { status: 'ENDED' }).catch(() => {});
            const currentCall = get().activeCallSignal;
            if (currentCall && currentCall.id === data.id) {
              set({ activeCallSignal: null });
            }
            return;
          }
        }

        if (change.type === 'added' || change.type === 'modified') {
          if (data.status === 'CONNECTED') {
            set((state) => ({
              activeCallSignal: state.activeCallSignal
                ? { ...state.activeCallSignal, status: 'CONNECTED' }
                : data,
            }));
          } else if (data.status === 'ENDED') {
            const currentCall = get().activeCallSignal;
            if (currentCall && currentCall.id === data.id) {
              set({ activeCallSignal: null });
            }
          }
        } else if (change.type === 'removed') {
          const currentCall = get().activeCallSignal;
          if (currentCall && currentCall.id === data.id) {
            set({ activeCallSignal: null });
          }
        }
      });
    });
    newUnsubs.push(unsubOutgoingCalls);

    // 5. Subscribe to incoming message requests for current user
    const requestsQuery = query(
      collection(firestoreDB, 'messageRequests'),
      where('recipientId', '==', user.id)
    );
    const unsubRequests = onSnapshot(requestsQuery, (snapshot: any) => {
      const reqList: MessageRequestDTO[] = [];
      snapshot.docs.forEach((docSnap: any) => {
        reqList.push({ id: docSnap.id, ...docSnap.data() } as MessageRequestDTO);
      });
      set((state) => {
        const outgoing = state.messageRequests.filter((r) => r.senderId === user.id);
        const reqMap = new Map<string, MessageRequestDTO>();
        [...reqList, ...outgoing].forEach((r) => reqMap.set(r.id, r));
        return { messageRequests: Array.from(reqMap.values()) };
      });
    });
    newUnsubs.push(unsubRequests);

    // 6. Subscribe to outgoing message requests sent by current user
    const outgoingRequestsQuery = query(
      collection(firestoreDB, 'messageRequests'),
      where('senderId', '==', user.id)
    );
    const unsubOutgoingRequests = onSnapshot(outgoingRequestsQuery, (snapshot: any) => {
      const outgoingList: MessageRequestDTO[] = [];
      snapshot.docs.forEach((docSnap: any) => {
        outgoingList.push({ id: docSnap.id, ...docSnap.data() } as MessageRequestDTO);
      });
      set((state) => {
        const incoming = state.messageRequests.filter((r) => r.recipientId === user.id);
        const reqMap = new Map<string, MessageRequestDTO>();
        [...incoming, ...outgoingList].forEach((r) => reqMap.set(r.id, r));
        return { messageRequests: Array.from(reqMap.values()) };
      });
    });
    newUnsubs.push(unsubOutgoingRequests);

    set({ unsubscribers: newUnsubs });
  },

  disconnectSocket: () => {
    useAuthStore.getState().stopPresenceHeartbeat();
    if (activeMessageUnsub) {
      activeMessageUnsub();
      activeMessageUnsub = null;
    }
    get().unsubscribers.forEach((unsub) => unsub());
    set({ unsubscribers: [] });
    sessionCache.clear();
    pendingX3DHHandshakes.clear();
  },

  fetchConversations: async () => {
    get().connectSocket();
  },

  selectConversation: async (id: string, pushHistory = true) => {
    if (activeMessageUnsub) {
      activeMessageUnsub();
      activeMessageUnsub = null;
    }

    if (typeof window !== 'undefined' && pushHistory) {
      const url = new URL(window.location.href);
      if (id) {
        if (url.searchParams.get('chat') !== id) {
          url.searchParams.set('chat', id);
          window.history.pushState({ screen: 'chat', chatId: id }, '', url.toString());
        }
      } else {
        if (url.searchParams.has('chat')) {
          url.searchParams.delete('chat');
          const cleanUrl = url.pathname + (url.search ? url.search : '');
          window.history.pushState({ screen: 'list' }, '', cleanUrl);
        }
      }
    }

    if (!id) {
      set({ activeConversationId: null });
      return;
    }
    set({ activeConversationId: id });
    const { user } = useAuthStore.getState();
    if (!user) return;

    // Load cached local messages from Dexie IndexedDB instantly
    const localMsgs = await db.messages.where('conversationId').equals(id).sortBy('createdAt');
    const sanitizedLocalMsgs = localMsgs.map((m) => ({
      ...m,
      decryptedText: (m.decryptedText && m.decryptedText !== '[Encrypted Message]') ? m.decryptedText : (m.text && m.text !== '[Encrypted Message]' ? m.text : ''),
      text: (m.text && m.text !== '[Encrypted Message]') ? m.text : (m.decryptedText && m.decryptedText !== '[Encrypted Message]' ? m.decryptedText : ''),
    }));
    set({
      messages: {
        ...get().messages,
        [id]: sanitizedLocalMsgs,
      },
    });

    // Real-time Firestore listener for messages in active conversation
    const messagesRef = collection(firestoreDB, 'conversations', id, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubMessages = onSnapshot(
      q,
      async (snapshot: any) => {
        try {
          // Fast lookup map for already-decrypted messages from memory & local db
          const knownDecrypted = new Map<string, string>();
          (get().messages[id] || []).forEach((m) => {
            if (m.decryptedText && m.decryptedText !== '[Encrypted Message]' && !m.decryptedText.startsWith('⚠️')) {
              knownDecrypted.set(m.id, m.decryptedText);
            }
          });
          localMsgs.forEach((m) => {
            if (m.decryptedText && m.decryptedText !== '[Encrypted Message]' && !m.decryptedText.startsWith('⚠️') && !knownDecrypted.has(m.id)) {
              knownDecrypted.set(m.id, m.decryptedText);
            }
          });

          // Process messages sequentially to preserve Double Ratchet sequence order
          const processedMsgs: LocalMessageRecord[] = [];
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const msg = { id: docSnap.id, ...data } as MessageDTO & { isDeleted?: boolean; mediaUrl?: string; text?: string; content?: string; decryptedText?: string };
            let textValue = '';
            let isDecrypted = false;

            if (msg.isDeleted) {
              textValue = '🚫 This message was deleted';
              isDecrypted = true;
            } else if (knownDecrypted.has(msg.id)) {
              textValue = knownDecrypted.get(msg.id)!;
              isDecrypted = true;
            } else if (msg.senderId === user.id) {
              // Message sent by current user: retrieve plaintext from local DB if exists
              const localMatch = await db.messages.get(msg.id);
              if (localMatch && localMatch.decryptedText && localMatch.decryptedText !== '[Encrypted Message]') {
                textValue = localMatch.decryptedText;
                isDecrypted = true;
              } else if (msg.decryptedText && msg.decryptedText !== '[Encrypted Message]') {
                textValue = msg.decryptedText;
                isDecrypted = true;
              } else {
                textValue = '🔒 Encrypted message';
                isDecrypted = true;
              }
              knownDecrypted.set(msg.id, textValue);
            } else if (msg.encryptedPayload && msg.encryptedPayload.ciphertext) {
              // Incoming message: decrypt via Double Ratchet
              try {
                let session = sessionCache.get(id);
                if (!session) {
                  const stored = await db.ratchetStates.get(id);
                  if (stored && stored.state) {
                    session = await DoubleRatchetSession.importState(stored.state);
                    sessionCache.set(id, session);
                  }
                }

                if (!session) {
                  if (msg.encryptedPayload.isInitialMessage) {
                    session = await get().getOrCreateRatchetSessionAsBob(id, msg.encryptedPayload);
                  } else {
                    throw new Error(`No local Double Ratchet session found for conversation ${id} and message is not marked as initial`);
                  }
                }

                const decrypted = await session.decrypt(msg.encryptedPayload);
                textValue = decrypted;
                isDecrypted = true;
                knownDecrypted.set(msg.id, textValue);

                // Persist updated session state
                const updatedState = await session.exportState();
                await db.ratchetStates.put({
                  conversationId: id,
                  recipientUserId: msg.senderId,
                  state: updatedState,
                  updatedAt: new Date().toISOString(),
                });
              } catch (decryptErr) {
                console.error(`[E2EE Decrypt Failure] Message ${msg.id} in conversation ${id}:`, decryptErr);
                textValue = '⚠️ Unable to decrypt this message';
                isDecrypted = false;
              }
            } else if (data.text && data.text !== '[Encrypted Message]') {
              textValue = data.text;
              isDecrypted = true;
            } else {
              textValue = '⚠️ Unable to decrypt this message';
              isDecrypted = false;
            }

            // Mark as READ in Firestore if incoming message & play sound for new incoming message
            if (msg.recipientId === user.id) {
              if (msg.status !== 'READ') {
                updateDoc(doc(firestoreDB, 'conversations', id, 'messages', msg.id), {
                  status: 'READ',
                }).catch(() => {});
              }
              if (!knownDecrypted.has(msg.id)) {
                playReceivedSound();
              }
            }

            processedMsgs.push({
              ...msg,
              text: textValue,
              decryptedText: textValue,
              isDecrypted,
              isDeleted: msg.isDeleted || false,
              mediaUrl: msg.mediaUrl || (data.mediaUrl as string) || null,
            } as LocalMessageRecord);
          }

          await db.messages.bulkPut(processedMsgs);
          set({
            messages: {
              ...get().messages,
              [id]: processedMsgs,
            },
          });
        } catch (err) {
          console.error('Messages processing notice:', err);
        }
      },
      (err: any) => console.warn('Messages snapshot listener notice:', err)
    );

    activeMessageUnsub = unsubMessages;
  },

  // Initiator session helper (Alice / Sender)
  getOrCreateRatchetSession: async (conversationId: string, recipientUser: UserProfile): Promise<DoubleRatchetSession> => {
    // 1. Check in-memory session cache
    if (sessionCache.has(conversationId)) {
      return sessionCache.get(conversationId)!;
    }

    // 2. Check Dexie IndexedDB persisted ratchet state
    const existingRecord = await db.ratchetStates.get(conversationId);
    if (existingRecord && existingRecord.state) {
      try {
        const session = await DoubleRatchetSession.importState(existingRecord.state);
        sessionCache.set(conversationId, session);
        return session;
      } catch (err) {
        console.error(`Failed to import existing ratchet state for ${conversationId}:`, err);
      }
    }

    // 3. None exists: fetch recipient's public key bundle from Firestore
    const recipientBundleRef = doc(firestoreDB, 'keyBundles', recipientUser.id);
    const recipientBundleSnap = await getDoc(recipientBundleRef);
    if (!recipientBundleSnap.exists()) {
      throw new Error(`Recipient public key bundle not found for user ${recipientUser.name || recipientUser.id}. They may need to sign in to initialize keys.`);
    }

    const bundleData = recipientBundleSnap.data();
    if (!bundleData.identityPublicKey || !bundleData.signedPreKey?.publicKey) {
      throw new Error('Recipient key bundle is invalid or missing required public keys.');
    }

    // Load our own device keys
    const deviceKeysRecord = await db.deviceKeys.get('current');
    if (!deviceKeysRecord) {
      throw new Error('Local device keys not initialized in IndexedDB.');
    }

    const aliceIdentityPrivateKey = await importPrivateKey(deviceKeysRecord.identityPrivateKey);

    // Pick a one-time prekey if available
    const oneTimePreKeys = bundleData.oneTimePreKeys || [];
    const selectedOPK = oneTimePreKeys.length > 0 ? oneTimePreKeys[0] : undefined;

    // Run X3DH initiator
    const x3dhResult = await initiateX3DHSession(
      aliceIdentityPrivateKey,
      {
        identityPublicKey: bundleData.identityPublicKey,
        signedPreKey: {
          publicKey: bundleData.signedPreKey.publicKey,
        },
        oneTimePreKey: selectedOPK ? {
          keyId: selectedOPK.keyId,
          publicKey: selectedOPK.publicKey,
        } : undefined,
      }
    );

    // Initialize Double Ratchet session as Alice with recipient's signed prekey public key
    const session = await DoubleRatchetSession.initAsAlice(
      x3dhResult.sharedMasterKey,
      bundleData.signedPreKey.publicKey
    );

    // Persist session to IndexedDB
    const exportedState = await session.exportState();
    await db.ratchetStates.put({
      conversationId,
      recipientUserId: recipientUser.id,
      state: exportedState,
      updatedAt: new Date().toISOString(),
    });

    // Cache in memory
    sessionCache.set(conversationId, session);

    // Store X3DH handshake parameters so sendMessage() can attach them to the first message payload
    pendingX3DHHandshakes.set(conversationId, {
      x3dhEphemeralPublicKey: x3dhResult.aliceEphemeralPublicKey,
      senderIdentityPublicKey: deviceKeysRecord.identityPublicKey,
      oneTimePreKeyIdUsed: x3dhResult.oneTimePreKeyIdUsed,
    });

    return session;
  },

  // Receiver session helper (Bob / Receiver)
  getOrCreateRatchetSessionAsBob: async (conversationId: string, payload: EncryptedPayload): Promise<DoubleRatchetSession> => {
    // 1. Check in-memory cache
    if (sessionCache.has(conversationId)) {
      return sessionCache.get(conversationId)!;
    }

    // 2. Check IndexedDB
    const existingRecord = await db.ratchetStates.get(conversationId);
    if (existingRecord && existingRecord.state) {
      try {
        const session = await DoubleRatchetSession.importState(existingRecord.state);
        sessionCache.set(conversationId, session);
        return session;
      } catch (err) {
        console.error(`Failed to import existing ratchet state for ${conversationId}:`, err);
      }
    }

    // 3. Load our private keys from IndexedDB
    const deviceKeysRecord = await db.deviceKeys.get('current');
    if (!deviceKeysRecord) {
      throw new Error('Local device keys not found in IndexedDB.');
    }

    if (!payload.senderIdentityPublicKey || !payload.x3dhEphemeralPublicKey) {
      throw new Error('Initial message payload missing senderIdentityPublicKey or x3dhEphemeralPublicKey.');
    }

    const bobIdentityPrivateKey = await importPrivateKey(deviceKeysRecord.identityPrivateKey);
    const bobSignedPrePrivateKey = await importPrivateKey(deviceKeysRecord.signedPreKeyPrivate);
    const bobSignedPrePublicKey = await importPublicKey(deviceKeysRecord.signedPreKeyPublic);

    const bobOneTimePrivateKeysMap = new Map<number, CryptoKey>();
    if (deviceKeysRecord.oneTimePreKeys) {
      for (const otpk of deviceKeysRecord.oneTimePreKeys) {
        try {
          const key = await importPrivateKey(otpk.privateKey);
          bobOneTimePrivateKeysMap.set(otpk.keyId, key);
        } catch (err) {
          console.warn(`Failed to import one-time prekey id ${otpk.keyId}:`, err);
        }
      }
    }

    // Run X3DH receiver
    const sharedMasterKey = await receiveX3DHSession(
      bobIdentityPrivateKey,
      bobSignedPrePrivateKey,
      bobOneTimePrivateKeysMap,
      payload.senderIdentityPublicKey,
      payload.x3dhEphemeralPublicKey,
      payload.oneTimePreKeyIdUsed
    );

    // Initialize Double Ratchet session as Bob with our signed prekey pair
    const bobDHKeyPair: CryptoKeyPair = {
      privateKey: bobSignedPrePrivateKey,
      publicKey: bobSignedPrePublicKey,
    };

    const session = await DoubleRatchetSession.initAsBob(
      sharedMasterKey,
      bobDHKeyPair
    );

    // If a one-time prekey was consumed, remove it locally and from Firestore
    if (payload.oneTimePreKeyIdUsed !== undefined) {
      const updatedOTPKeys = (deviceKeysRecord.oneTimePreKeys || []).filter(
        (k) => k.keyId !== payload.oneTimePreKeyIdUsed
      );
      await db.deviceKeys.update('current', { oneTimePreKeys: updatedOTPKeys });

      const { user } = useAuthStore.getState();
      if (user) {
        try {
          const keyBundleRef = doc(firestoreDB, 'keyBundles', user.id);
          const keyBundleSnap = await getDoc(keyBundleRef);
          if (keyBundleSnap.exists()) {
            const bundleData = keyBundleSnap.data();
            const remoteOTPKeys = (bundleData.oneTimePreKeys || []).filter(
              (k: any) => k.keyId !== payload.oneTimePreKeyIdUsed
            );
            await updateDoc(keyBundleRef, {
              oneTimePreKeys: remoteOTPKeys,
              updatedAt: new Date().toISOString(),
            });
          }
        } catch (syncErr) {
          console.warn('Failed to remove consumed oneTimePreKey from Firestore:', syncErr);
        }
      }
    }

    // Persist session state
    const exportedState = await session.exportState();
    await db.ratchetStates.put({
      conversationId,
      recipientUserId: '',
      state: exportedState,
      updatedAt: new Date().toISOString(),
    });

    // Cache in memory
    sessionCache.set(conversationId, session);

    return session;
  },

  sendMessage: async (text: string, replyToId?: string, messageType: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO_NOTE' = 'TEXT', mediaUrl?: string, frameStyle?: string) => {
    const { activeConversationId, conversations, userPresence } = get();
    const { user } = useAuthStore.getState();
    if (!activeConversationId || !user) return;

    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    const recipient = conv.participants.find((p) => p && p.id !== user.id);
    if (!recipient) return;

    const myBlocked = (user as any).blockedUserIds || [];
    const recipientBlocked = userPresence[recipient.id]?.blockedUserIds || [];

    if (myBlocked.includes(recipient.id) || recipientBlocked.includes(user.id)) {
      throw new Error('Messaging is unavailable. Communications are blocked with this user.');
    }

    const payloadText = text || '';
    const lastMsgText = messageType === 'IMAGE' ? '📷 Photo' : messageType === 'VOICE' ? '🎵 Voice Note' : messageType === 'VIDEO_NOTE' ? '🎥 10s Video Note' : (payloadText || 'Message');

    // 1. Get or create active Double Ratchet session for recipient
    const session = await get().getOrCreateRatchetSession(activeConversationId, recipient);

    // 2. Encrypt plaintext payload with Double Ratchet
    const plaintextToEncrypt = payloadText || (messageType !== 'TEXT' ? lastMsgText : '');
    const encryptedPayload: EncryptedPayload = await session.encrypt(plaintextToEncrypt);

    // 3. Attach X3DH handshake headers if this is the initial message
    if (pendingX3DHHandshakes.has(activeConversationId)) {
      const handshake = pendingX3DHHandshakes.get(activeConversationId)!;
      encryptedPayload.isInitialMessage = true;
      encryptedPayload.x3dhEphemeralPublicKey = handshake.x3dhEphemeralPublicKey;
      encryptedPayload.senderIdentityPublicKey = handshake.senderIdentityPublicKey;
      if (handshake.oneTimePreKeyIdUsed !== undefined) {
        encryptedPayload.oneTimePreKeyIdUsed = handshake.oneTimePreKeyIdUsed;
      }
      pendingX3DHHandshakes.delete(activeConversationId);
    }

    // 4. Persist updated ratchet state (sending sequence ratcheted forward)
    const updatedState = await session.exportState();
    await db.ratchetStates.put({
      conversationId: activeConversationId,
      recipientUserId: recipient.id,
      state: updatedState,
      updatedAt: new Date().toISOString(),
    });

    const msgRef = doc(collection(firestoreDB, 'conversations', activeConversationId, 'messages'));
    const messageDocData = {
      id: msgRef.id,
      conversationId: activeConversationId,
      senderId: user.id,
      recipientId: recipient.id,
      text: '[Encrypted Message]',
      decryptedText: '[Encrypted Message]',
      encryptedPayload,
      messageType,
      mediaUrl: mediaUrl || null,
      frameStyle: frameStyle || null,
      replyToId: replyToId || null,
      status: 'DELIVERED' as const,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };

    // Store ciphertext document in Firestore (never plaintext)
    await setDoc(msgRef, messageDocData);
    playSentSound();

    // Update conversation document preview with encrypted placeholder (never plaintext)
    await updateDoc(doc(firestoreDB, 'conversations', activeConversationId), {
      lastMessage: {
        id: msgRef.id,
        senderId: user.id,
        text: '[Encrypted Message]',
        decryptedText: '[Encrypted Message]',
        createdAt: messageDocData.createdAt,
      },
      updatedAt: messageDocData.createdAt,
    });

    // Store decrypted plaintext in local IndexedDB & memory for immediate UI display
    const localRecord: LocalMessageRecord = {
      ...messageDocData,
      encryptedPayload,
      decryptedText: plaintextToEncrypt || lastMsgText,
      text: plaintextToEncrypt || lastMsgText,
      isDecrypted: true,
      mediaUrl: mediaUrl || null,
      messageType,
      isDeleted: false,
    };

    const currentMsgs = get().messages[activeConversationId] || [];
    set({
      messages: {
        ...get().messages,
        [activeConversationId]: [...currentMsgs.filter((m) => m.id !== msgRef.id), localRecord],
      },
    });

    await db.messages.put(localRecord);
  },

  deleteMessage: async (messageId: string) => {
    const { activeConversationId, messages } = get();
    if (!activeConversationId) return;

    try {
      const msgRef = doc(firestoreDB, 'conversations', activeConversationId, 'messages', messageId);
      await updateDoc(msgRef, {
        isDeleted: true,
        'encryptedPayload.ciphertext': '',
        'encryptedPayload.iv': '',
        mediaUrl: null,
      });

      const currentMsgs = messages[activeConversationId] || [];
      const updated = currentMsgs.map((m) => {
        if (m.id === messageId) {
          return {
            ...m,
            isDeleted: true,
            decryptedText: '🚫 This message was deleted',
            mediaUrl: undefined,
          };
        }
        return m;
      });

      set({
        messages: {
          ...messages,
          [activeConversationId]: updated,
        },
      });

      await db.messages.update(messageId, {
        isDeleted: true,
        decryptedText: '🚫 This message was deleted',
      });
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  },

  createConversation: async (searchInput: string) => {
    const { user } = useAuthStore.getState();
    if (!user) throw new Error('Not authenticated');

    const term = searchInput.trim();
    if (!term) {
      throw new Error('Please enter a name, email, or phone number to search');
    }

    const cleanSearchDigits = term.replace(/\D/g, '');
    const usersSnap = await getDocs(collection(firestoreDB, 'users'));
    let recipientUser: UserProfile | null = null;

    // Search registered users by Name, Email, or Phone Number
    const matchedDoc = usersSnap.docs.find((docSnap: any) => {
      const uData = docSnap.data() as UserProfile & { email?: string; blockedUserIds?: string[] };
      if (uData.id === user.id) return false;

      const myBlocked = (user as any).blockedUserIds || [];
      const targetBlocked = uData.blockedUserIds || [];

      // Blocked users cannot be searched or found
      if (myBlocked.includes(uData.id) || targetBlocked.includes(user.id)) return false;

      const uName = (uData.name || '').toLowerCase();
      const uEmail = (uData.email || '').toLowerCase();
      const uPhone = (uData.phoneNumber || '').toLowerCase();
      const userPhoneDigits = uPhone.replace(/\D/g, '');
      const searchLower = term.toLowerCase();

      // Match by Name
      if (uName.includes(searchLower)) return true;

      // Match by Email
      if (uEmail && uEmail.includes(searchLower)) return true;

      // Match by Phone exact or normalized digits
      if (uPhone && uPhone.includes(searchLower)) return true;

      if (cleanSearchDigits && cleanSearchDigits.length >= 4 && userPhoneDigits) {
        if (
          userPhoneDigits === cleanSearchDigits ||
          userPhoneDigits.endsWith(cleanSearchDigits) ||
          cleanSearchDigits.endsWith(userPhoneDigits)
        ) {
          return true;
        }
      }

      return false;
    });

    if (matchedDoc) {
      recipientUser = matchedDoc.data() as UserProfile;
    }

    if (!recipientUser) {
      throw new Error(`No registered Chat-Ko user found matching "${searchInput}"`);
    }

    if (recipientUser.id === user.id) {
      throw new Error('Cannot start conversation with yourself');
    }

    // Check if conversation already exists
    const existingQ = query(
      collection(firestoreDB, 'conversations'),
      where('participantIds', 'array-contains', user.id)
    );
    const existingSnap = await getDocs(existingQ);

    for (const d of existingSnap.docs) {
      const data = d.data();
      if (!data.isGroup && data.participantIds.includes(recipientUser.id)) {
        return {
          id: d.id,
          isGroup: false,
          participants: [user, recipientUser],
          updatedAt: data.updatedAt || new Date().toISOString(),
        };
      }
    }

    // Create new conversation document
    const newConvRef = doc(collection(firestoreDB, 'conversations'));
    const newConvData = {
      id: newConvRef.id,
      isGroup: false,
      participantIds: [user.id, recipientUser.id],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(newConvRef, newConvData);

    const convDTO: ConversationDTO = {
      ...newConvData,
      participants: [user, recipientUser],
    };

    get().fetchConversations();
    return convDTO;
  },

  setTyping: (isTyping: boolean) => {
    const { activeConversationId } = get();
    const { user } = useAuthStore.getState();
    if (!activeConversationId || !user) return;

    // Update local state (for our own optimistic UI if ever needed)
    set({ typingStatus: { ...get().typingStatus, [activeConversationId]: isTyping } });

    // Write to Firestore so the other participant can read it
    updateDoc(doc(firestoreDB, 'conversations', activeConversationId), {
      [`typingUsers.${user.id}`]: isTyping,
    }).catch(() => {});

    // Auto-clear after 3 seconds of no new typing events (prevents stuck indicator)
    if (isTyping) {
      const existing = typingClearTimers.get(activeConversationId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        updateDoc(doc(firestoreDB, 'conversations', activeConversationId), {
          [`typingUsers.${user.id}`]: false,
        }).catch(() => {});
        typingClearTimers.delete(activeConversationId);
      }, 3000);
      typingClearTimers.set(activeConversationId, timer);
    } else {
      const existing = typingClearTimers.get(activeConversationId);
      if (existing) { clearTimeout(existing); typingClearTimers.delete(activeConversationId); }
    }
  },

  startCall: async (recipientUser: UserProfile, callType: 'AUDIO' | 'VIDEO') => {
    const { user } = useAuthStore.getState();
    const { activeConversationId, userPresence } = get();
    if (!user || !activeConversationId || !recipientUser || !recipientUser.id) {
      alert('Unable to start call. Contact information is missing.');
      return;
    }

    const myBlocked = (user as any).blockedUserIds || [];
    const recipientBlocked = userPresence[recipientUser.id]?.blockedUserIds || [];

    if (myBlocked.includes(recipientUser.id) || recipientBlocked.includes(user.id)) {
      alert('Cannot start call. Communications are blocked with this user.');
      return;
    }

    const callDocRef = doc(collection(firestoreDB, 'calls'));
    const callSignal: CallSignal = {
      id: callDocRef.id,
      conversationId: activeConversationId,
      callerId: user.id,
      callerName: user.name || 'Chat-Ko User',
      callerAvatar: user.avatarUrl || '',
      recipientId: recipientUser.id,
      callType,
      status: 'OFFER',
    };

    // Set active call signal immediately to ensure instant button response
    set({ activeCallSignal: callSignal });

    try {
      await setDoc(callDocRef, {
        ...callSignal,
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Failed to write call signal to Firestore:', err);
      alert('Could not start call due to network issue.');
      set({ activeCallSignal: null });
    }
  },

  acceptCall: async () => {
    const { activeCallSignal } = get();
    if (!activeCallSignal) return;

    try {
      const callDocRef = doc(firestoreDB, 'calls', activeCallSignal.id);
      await updateDoc(callDocRef, { status: 'CONNECTED' });
    } catch (e) {
      console.warn('Accept call update notice:', e);
    }

    set({
      activeCallSignal: {
        ...activeCallSignal,
        status: 'CONNECTED',
      },
    });
  },

  endCall: async () => {
    const { activeCallSignal } = get();
    if (!activeCallSignal) return;

    try {
      const callDocRef = doc(firestoreDB, 'calls', activeCallSignal.id);
      await updateDoc(callDocRef, { status: 'ENDED' });
    } catch (e) {
      console.warn('End call update notice:', e);
    }

    set({ activeCallSignal: null });
  },

  sendRequest: async (targetUser: UserProfile) => {
    const { user } = useAuthStore.getState();
    const { messageRequests } = get();
    if (!user) throw new Error('Not authenticated');

    const existing = messageRequests.find(
      (r) => (r.senderId === user.id && r.recipientId === targetUser.id) ||
             (r.senderId === targetUser.id && r.recipientId === user.id)
    );
    if (existing && existing.status === 'PENDING') {
      throw new Error('A message request is already pending with this contact.');
    }

    const reqRef = doc(collection(firestoreDB, 'messageRequests'));
    const reqData: MessageRequestDTO = {
      id: reqRef.id,
      senderId: user.id,
      senderName: user.name || 'Chat-Ko User',
      senderAvatar: user.avatarUrl || '',
      senderPhone: user.phoneNumber || '',
      recipientId: targetUser.id,
      recipientName: targetUser.name || 'Chat-Ko Contact',
      recipientAvatar: targetUser.avatarUrl || '',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(reqRef, reqData);

    set({
      messageRequests: [...get().messageRequests.filter((r) => r.id !== reqRef.id), reqData],
    });
  },

  acceptRequest: async (requestId: string) => {
    const { user } = useAuthStore.getState();
    const { messageRequests, fetchConversations } = get();
    if (!user) return;

    const req = messageRequests.find((r) => r.id === requestId);
    if (!req) return;

    const otherUserId = req.senderId === user.id ? req.recipientId : req.senderId;

    await updateDoc(doc(firestoreDB, 'messageRequests', requestId), {
      status: 'ACCEPTED',
      updatedAt: new Date().toISOString(),
    });

    try {
      const existingQ = query(
        collection(firestoreDB, 'conversations'),
        where('participantIds', 'array-contains', user.id)
      );
      const existingSnap = await getDocs(existingQ);
      let existingConvId: string | null = null;

      for (const d of existingSnap.docs) {
        const data = d.data();
        if (!data.isGroup && data.participantIds.includes(otherUserId)) {
          existingConvId = d.id;
          break;
        }
      }

      if (!existingConvId) {
        const newConvRef = doc(collection(firestoreDB, 'conversations'));
        await setDoc(newConvRef, {
          id: newConvRef.id,
          isGroup: false,
          participantIds: [user.id, otherUserId],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingConvId = newConvRef.id;
      }

      set((state) => ({
        activeConversationId: existingConvId,
        messageRequests: state.messageRequests.map((r) =>
          r.id === requestId ? { ...r, status: 'ACCEPTED' } : r
        ),
      }));
    } catch (e) {
      console.error('Failed to create conversation on accept request:', e);
    }

    fetchConversations();
  },

  declineRequest: async (requestId: string) => {
    await updateDoc(doc(firestoreDB, 'messageRequests', requestId), {
      status: 'DECLINED',
      updatedAt: new Date().toISOString(),
    });

    set((state) => ({
      messageRequests: state.messageRequests.map((r) =>
        r.id === requestId ? { ...r, status: 'DECLINED' } : r
      ),
    }));
  },
}));
