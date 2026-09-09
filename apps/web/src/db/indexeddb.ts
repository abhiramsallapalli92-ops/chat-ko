import Dexie, { Table } from 'dexie';
import { SerializedRatchetState } from '@chat/crypto';
import { MessageDTO, UserProfile, ConversationDTO } from '@chat/shared-types';

export interface LocalDeviceKeysRecord {
  id: string; // 'current'
  registrationId: number;
  identityPrivateKey: string;
  identityPublicKey: string;
  signedPreKeyPrivate: string;
  signedPreKeyPublic: string;
  signedPreKeyId: number;
  signedPreKeySig: string;
  oneTimePreKeys: Array<{ keyId: number; privateKey: string; publicKey: string }>;
}

export interface LocalRatchetStateRecord {
  conversationId: string;
  recipientUserId: string;
  state: SerializedRatchetState;
  updatedAt: string;
}

export interface LocalMessageRecord extends MessageDTO {
  text?: string;
  decryptedText?: string;
  isDecrypted?: boolean;
  isDeleted?: boolean;
  mediaUrl?: string | null;
  frameStyle?: string | null;
}

export class WhisperDexieDB extends Dexie {
  deviceKeys!: Table<LocalDeviceKeysRecord, string>;
  ratchetStates!: Table<LocalRatchetStateRecord, string>;
  messages!: Table<LocalMessageRecord, string>;
  contacts!: Table<UserProfile, string>;
  conversations!: Table<ConversationDTO, string>;

  constructor() {
    super('WhisperEncryptedDB');
    this.version(1).stores({
      deviceKeys: 'id',
      ratchetStates: 'conversationId, recipientUserId',
      messages: 'id, conversationId, senderId, recipientId, status, createdAt',
      contacts: 'id, phoneNumber, name',
      conversations: 'id, isGroup, updatedAt',
    });
  }
}

export const db = new WhisperDexieDB();
