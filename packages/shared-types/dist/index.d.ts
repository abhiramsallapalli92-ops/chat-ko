export interface UserProfile {
    id: string;
    phoneNumber: string;
    name: string;
    avatarUrl?: string | null;
    bio?: string | null;
    status: 'ONLINE' | 'OFFLINE';
    lastSeen?: string | null;
    createdAt: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken?: string;
    user: UserProfile;
}
export interface SendOtpRequest {
    phoneNumber: string;
}
export interface SendOtpResponse {
    success: boolean;
    message: string;
    devCode?: string;
}
export interface VerifyOtpRequest {
    phoneNumber: string;
    code: string;
}
export interface RegisterKeysRequest {
    deviceId: string;
    registrationId: number;
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
export interface FetchPreKeyBundleResponse {
    userId: string;
    deviceId: string;
    registrationId: number;
    identityPublicKey: string;
    signedPreKey: {
        keyId: number;
        publicKey: string;
        signature: string;
    };
    oneTimePreKey?: {
        keyId: number;
        publicKey: string;
    };
}
export interface EncryptedPayload {
    ciphertext: string;
    iv: string;
    ephemeralPublicKey: string;
    ratchetSequence: number;
    previousChainLength: number;
    oneTimePreKeyIdUsed?: number;
}
export interface SendMessageRequest {
    conversationId: string;
    recipientId: string;
    encryptedPayload: EncryptedPayload;
    messageType?: 'TEXT' | 'IMAGE' | 'VOICE' | 'DOCUMENT' | 'VIDEO_NOTE';
    mediaUrl?: string;
    mediaKey?: string;
    replyToId?: string;
}
export interface MessageDTO {
    id: string;
    conversationId: string;
    senderId: string;
    recipientId: string;
    encryptedPayload: EncryptedPayload;
    messageType: 'TEXT' | 'IMAGE' | 'VOICE' | 'DOCUMENT' | 'VIDEO_NOTE';
    mediaUrl?: string | null;
    mediaKey?: string | null;
    replyToId?: string | null;
    status: 'SENT' | 'DELIVERED' | 'READ';
    createdAt: string;
}
export interface ReadReceiptPayload {
    messageIds: string[];
    conversationId: string;
    readByUserId: string;
}
export interface DeliveryReceiptPayload {
    messageIds: string[];
    conversationId: string;
    deliveredToUserId: string;
}
export interface TypingPayload {
    conversationId: string;
    userId: string;
    isTyping: boolean;
}
export interface PresencePayload {
    userId: string;
    status: 'ONLINE' | 'OFFLINE';
    lastSeen?: string;
}
export interface ConversationDTO {
    id: string;
    isGroup: boolean;
    name?: string | null;
    groupAvatar?: string | null;
    participants: UserProfile[];
    lastMessage?: MessageDTO | null;
    unreadCount?: number;
    updatedAt: string;
}
export interface CreateConversationRequest {
    recipientPhoneNumber?: string;
    recipientUserId?: string;
    isGroup?: boolean;
    groupName?: string;
    memberUserIds?: string[];
}
