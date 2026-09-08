import { create } from 'zustand';
import { ConversationDTO, MessageDTO, UserProfile, EncryptedPayload } from '@chat/shared-types';
import {
  DoubleRatchetSession,
  initiateX3DHSession,
  importPrivateKey
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
}

// In-memory active Double Ratchet sessions cache
const sessionCache = new Map<string, DoubleRatchetSession>();
// In-memory user profile cache to avoid re-fetching on every snapshot
const userProfileCache = new Map<string, UserProfile>();
// Track active message unsubscriber to prevent memory/listener leaks on chat switch
let activeMessageUnsub: (() => void) | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingStatus: {},
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
      }

      set({ conversations: convList });
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
    if (activeMessageUnsub) {
      activeMessageUnsub();
      activeMessageUnsub = null;
    }
    get().unsubscribers.forEach((unsub) => unsub());
    set({ unsubscribers: [] });
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
    set({
      messages: {
        ...get().messages,
        [id]: localMsgs,
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
            if (m.decryptedText && m.decryptedText !== '[Encrypted Message]') {
              knownDecrypted.set(m.id, m.decryptedText);
            }
          });
          localMsgs.forEach((m) => {
            if (m.decryptedText && m.decryptedText !== '[Encrypted Message]' && !knownDecrypted.has(m.id)) {
              knownDecrypted.set(m.id, m.decryptedText);
            }
          });

          // Decrypt messages in parallel
          const processedMsgs = await Promise.all(
            snapshot.docs.map(async (docSnap: any) => {
              const data = docSnap.data();
              const msg = { id: docSnap.id, ...data } as MessageDTO & { isDeleted?: boolean; mediaUrl?: string };
              let decryptedText = '';

              if (msg.isDeleted) {
                decryptedText = '🚫 This message was deleted';
              } else if (knownDecrypted.has(msg.id)) {
                decryptedText = knownDecrypted.get(msg.id)!;
              } else {
                // Try Double Ratchet decryption first
                if (msg.encryptedPayload?.ciphertext && msg.encryptedPayload?.ephemeralPublicKey) {
                  try {
                    const conv = get().conversations.find((c) => c.id === id);
                    const sender = conv?.participants.find((p) => p.id === msg.senderId);
                    if (sender && sender.id !== user.id) {
                      const session = await get().getOrCreateRatchetSession(id, sender);
                      decryptedText = await session.decrypt(msg.encryptedPayload as EncryptedPayload);
                      // Persist advanced ratchet state
                      const exported = await session.exportState();
                      await db.ratchetStates.put({
                        conversationId: id,
                        recipientUserId: sender.id,
                        state: exported,
                        updatedAt: new Date().toISOString(),
                      });
                    } else if (msg.senderId === user.id) {
                      // Own messages: recover from local store (we stored decryptedText when sending)
                      const existingInMemory = (get().messages[id] || []).find((m) => m.id === msg.id);
                      const existingInLocal = localMsgs.find((m) => m.id === msg.id);
                      decryptedText = existingInMemory?.decryptedText || existingInLocal?.decryptedText || '';
                    }
                  } catch (err) {
                    console.warn('Double Ratchet decryption failed, trying legacy fallback:', err);
                    // Fallback: own messages recover from local cache
                    if (msg.senderId === user.id) {
                      const existingInMemory = (get().messages[id] || []).find((m) => m.id === msg.id);
                      const existingInLocal = localMsgs.find((m) => m.id === msg.id);
                      decryptedText = existingInMemory?.decryptedText || existingInLocal?.decryptedText || '';
                    }
                  }
                } else if (msg.encryptedPayload?.ciphertext) {
                  // Legacy messages encrypted with old scheme — recover own messages from local cache only
                  if (msg.senderId === user.id) {
                    const existingInMemory = (get().messages[id] || []).find((m) => m.id === msg.id);
                    const existingInLocal = localMsgs.find((m) => m.id === msg.id);
                    decryptedText = existingInMemory?.decryptedText || existingInLocal?.decryptedText || '';
                  }
                }
              }

              if (!decryptedText && !msg.isDeleted) decryptedText = '[Encrypted Message]';

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

              return {
                ...msg,
                decryptedText,
                isDecrypted: true,
                isDeleted: msg.isDeleted || false,
                mediaUrl: msg.mediaUrl || (data.mediaUrl as string) || null,
              } as LocalMessageRecord;
            })
          );

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

  getOrCreateRatchetSession: async (conversationId: string, recipientUser: UserProfile): Promise<DoubleRatchetSession> => {
    if (sessionCache.has(conversationId)) {
      return sessionCache.get(conversationId)!;
    }

    const stored = await db.ratchetStates.get(conversationId);
    if (stored) {
      const session = await DoubleRatchetSession.importState(stored.state);
      sessionCache.set(conversationId, session);
      return session;
    }

    const { deviceKeys } = useAuthStore.getState();
    if (!deviceKeys) throw new Error('Client device keys missing for E2EE setup');

    // Fetch recipient's PreKey Bundle from Firestore keyBundles collection
    const bundleSnap = await getDoc(doc(firestoreDB, 'keyBundles', recipientUser.id));
    if (!bundleSnap.exists()) {
      throw new Error('Target contact has no registered public key bundle in Firestore');
    }

    const preKeyBundle = bundleSnap.data();
    const ikPrivateKey = await importPrivateKey(deviceKeys.identityKey.privateKey);

    const oneTimeKey = preKeyBundle.oneTimePreKeys && preKeyBundle.oneTimePreKeys.length > 0
      ? preKeyBundle.oneTimePreKeys[0]
      : undefined;

    const x3dhResult = await initiateX3DHSession(ikPrivateKey, {
      identityPublicKey: preKeyBundle.identityPublicKey,
      signedPreKey: preKeyBundle.signedPreKey,
      oneTimePreKey: oneTimeKey,
    });

    const session = await DoubleRatchetSession.initAsAlice(
      x3dhResult.sharedMasterKey,
      preKeyBundle.signedPreKey.publicKey
    );

    const exported = await session.exportState();
    await db.ratchetStates.put({
      conversationId,
      recipientUserId: recipientUser.id,
      state: exported,
      updatedAt: new Date().toISOString(),
    });

    sessionCache.set(conversationId, session);
    return session;
  },

  sendMessage: async (text: string, replyToId?: string, messageType: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO_NOTE' = 'TEXT', mediaUrl?: string, frameStyle?: string) => {
    const { activeConversationId, conversations, userPresence } = get();
    const { user } = useAuthStore.getState();
    if (!activeConversationId || !user) return;

    const conv = conversations.find((c) => c.id === activeConversationId);
    if (!conv) return;

    const recipient = conv.participants.find((p) => p.id !== user.id);
    if (!recipient) return;

    const myBlocked = (user as any).blockedUserIds || [];
    const recipientBlocked = userPresence[recipient.id]?.blockedUserIds || [];

    if (myBlocked.includes(recipient.id) || recipientBlocked.includes(user.id)) {
      throw new Error('Messaging is unavailable. Communications are blocked with this user.');
    }

    const payloadToEncrypt = mediaUrl || text;

    // Encrypt with real Double Ratchet session (falls back to empty payload on error)
    let encryptedPayload: EncryptedPayload = {
      ciphertext: '',
      iv: '',
      ephemeralPublicKey: '',
      ratchetSequence: 0,
      previousChainLength: 0,
    };
    try {
      const session = await get().getOrCreateRatchetSession(activeConversationId, recipient);
      encryptedPayload = await session.encrypt(payloadToEncrypt);
      // Persist advanced ratchet state so next message uses the next ratchet step
      const exported = await session.exportState();
      await db.ratchetStates.put({
        conversationId: activeConversationId,
        recipientUserId: recipient.id,
        state: exported,
        updatedAt: new Date().toISOString(),
      });
      // Update in-memory session cache with current state
      sessionCache.set(activeConversationId, session);
    } catch (e2eeErr) {
      console.error('E2EE encrypt failed — message will be stored with empty payload:', e2eeErr);
    }

    const msgRef = doc(collection(firestoreDB, 'conversations', activeConversationId, 'messages'));
    const messageDocData = {
      id: msgRef.id,
      conversationId: activeConversationId,
      senderId: user.id,
      recipientId: recipient.id,
      encryptedPayload,
      messageType,
      mediaUrl: (messageType === 'VIDEO_NOTE' || messageType === 'IMAGE' || messageType === 'VOICE') ? null : (mediaUrl || null),
      frameStyle: frameStyle || null,
      replyToId: replyToId || null,
      status: 'DELIVERED' as const,
      isDeleted: false,
      createdAt: new Date().toISOString(),
    };

    await setDoc(msgRef, messageDocData);
    playSentSound();

    const lastMsgText = messageType === 'IMAGE' ? '📷 Photo' : messageType === 'VOICE' ? '🎵 Voice Note' : messageType === 'VIDEO_NOTE' ? '🎥 10s Video Note' : text;

    await updateDoc(doc(firestoreDB, 'conversations', activeConversationId), {
      lastMessage: {
        id: msgRef.id,
        senderId: user.id,
        decryptedText: lastMsgText,
        createdAt: messageDocData.createdAt,
      },
      updatedAt: messageDocData.createdAt,
    });

    const localRecord: LocalMessageRecord = {
      ...messageDocData,
      encryptedPayload,
      decryptedText: (messageType === 'VIDEO_NOTE' || messageType === 'IMAGE' || messageType === 'VOICE') ? (mediaUrl || text || lastMsgText) : (text || lastMsgText),
      isDecrypted: true,
      mediaUrl: (messageType === 'VIDEO_NOTE' || messageType === 'IMAGE' || messageType === 'VOICE') ? null : (mediaUrl || null),
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
    if (activeConversationId) {
      set({ typingStatus: { ...get().typingStatus, [activeConversationId]: isTyping } });
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
