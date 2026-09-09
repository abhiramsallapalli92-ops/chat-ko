import React, { useState, useEffect } from 'react';
import {
  Search,
  MessageSquarePlus,
  Settings,
  Lock,
  ShieldCheck,
  UserCheck,
  PlusCircle,
  X,
  UserPlus,
  Check,
  Clock,
  Inbox
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, isUserOnline } from '../../store/useChatStore';
import { firestoreDB } from '../../lib/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '@chat/shared-types';
import { PullToRefresh } from '../common/PullToRefresh';
import { playTapSound, playPullRefreshSound } from '../../lib/soundEffects';

interface SidebarProps {
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings }) => {
  const { user } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    selectConversation,
    fetchConversations,
    createConversation,
    userPresence,
    messageRequests,
    sendRequest,
    acceptRequest,
    declineRequest
  } = useChatStore();

  const [activeTab, setActiveTab] = useState<'CHATS' | 'REQUESTS'>('CHATS');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [allRegisteredUsers, setAllRegisteredUsers] = useState<Array<UserProfile & { email?: string }>>([]);
  const [creating, setCreating] = useState(false);
  const [requestStatusMap, setRequestStatusMap] = useState<Record<string, string>>({});

  // Real-time listener for all registered users in Firestore
  useEffect(() => {
    const usersQ = query(collection(firestoreDB, 'users'));
    const unsub = onSnapshot(
      usersQ,
      (snapshot: any) => {
        const uList: Array<UserProfile & { email?: string }> = [];
        snapshot.docs.forEach((docSnap: any) => {
          if (docSnap.id !== user?.id) {
            uList.push({ id: docSnap.id, ...docSnap.data() } as any);
          }
        });
        setAllRegisteredUsers(uList);
      },
      (err: any) => console.warn('Users search fetch notice:', err)
    );

    return () => unsub();
  }, [user?.id]);

  // Count pending incoming requests
  const pendingRequests = messageRequests.filter(
    (r) => r.recipientId === user?.id && r.status === 'PENDING'
  );

  // Live matching registered users search results — sorted A-Z by name
  const liveSearchUsers = allRegisteredUsers
    .filter((u) => {
      if (!searchQuery.trim()) return false;
      const term = searchQuery.trim().toLowerCase();
      const myBlocked = (user as any)?.blockedUserIds || [];
      const targetBlocked = (u as any)?.blockedUserIds || [];

      if (myBlocked.includes(u.id) || (user?.id && targetBlocked.includes(user.id))) return false;

      const nameMatch = (u.name || '').toLowerCase().includes(term);
      const emailMatch = (u.email || '').toLowerCase().includes(term);
      const phoneMatch = (u.phoneNumber || '').includes(term);
      const bioMatch = (u.bio || '').toLowerCase().includes(term);

      return nameMatch || emailMatch || phoneMatch || bioMatch;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

  // Filter conversations for Chats tab
  const filteredConversations = conversations.filter((conv) => {
    if (!conv || !conv.participants) return false;
    const otherParticipant = conv.participants.find((p) => p && p.id !== user?.id);
    const presence = otherParticipant ? userPresence[otherParticipant.id] : undefined;
    const recipientBlocked = presence?.blockedUserIds || [];
    const isBlockedByThem = (otherParticipant && user?.id) ? recipientBlocked.includes(user.id) : false;

    const displayName = isBlockedByThem ? 'Chat-Ko User' : otherParticipant?.name || '';
    const nameMatch = displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const phoneMatch = !isBlockedByThem && (otherParticipant?.phoneNumber || '').includes(searchQuery);
    return !searchQuery.trim() || nameMatch || phoneMatch;
  });

  const handleSendRequest = async (targetUser: UserProfile) => {
    setRequestStatusMap((prev) => ({ ...prev, [targetUser.id]: 'SENDING' }));
    try {
      await sendRequest(targetUser);
      setRequestStatusMap((prev) => ({ ...prev, [targetUser.id]: 'SENT' }));
    } catch (e: any) {
      alert(e.message || 'Failed to send message request');
      setRequestStatusMap((prev) => ({ ...prev, [targetUser.id]: 'ERROR' }));
    }
  };

  return (
    <div className="w-full h-full bg-black/30 md:bg-black/20 backdrop-blur-2xl border-r border-white/10 flex flex-col flex-shrink-0 select-none">
      {/* iOS Top App Bar */}
      <div className="h-16 px-4 glass-header flex items-center justify-between flex-shrink-0 safe-top">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={user?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.phoneNumber}`}
              alt="Avatar"
              className="w-10 h-10 rounded-full bg-[#1C1C1E] object-cover ring-2 ring-white/15 shadow-md"
            />
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-black rounded-full shadow" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-[#f0f2f7] line-clamp-1">{user?.name}</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium tracking-tight">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => { playTapSound(); setShowNewChatModal(true); }}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 active:scale-95 rounded-full text-[#4f8ef7] transition-all"
            title="New Chat / Search Users"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>
          <button
            onClick={() => { playTapSound(); onOpenSettings(); }}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 active:scale-95 rounded-full text-[#8a8ea0] hover:text-white transition-all"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* iOS Search Bar */}
      <div className="px-3 pt-2 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#8E8E93]" />
          <input
            type="text"
            placeholder="Search messages or users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.06] backdrop-blur-md text-base md:text-xs text-[#F2F2F7] placeholder-[#8E8E93] pl-9 pr-8 py-2 rounded-[10px] border border-white/10 focus:border-[#0A84FF]/50 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 w-6 h-6 flex items-center justify-center text-[#8E8E93] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* iOS Segmented Control: Chats vs Requests */}
      <div className="px-3 pb-2">
        <div className="flex items-center bg-white/[0.05] p-0.5 rounded-[9px] border border-white/10">
          <button
            onClick={() => { playTapSound(); setActiveTab('CHATS'); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[7px] transition-all ${
              activeTab === 'CHATS'
                ? 'glass-surface text-white shadow-sm font-semibold border border-white/15'
                : 'text-[#8a8ea0] hover:text-white'
            }`}
          >
            Chats ({conversations.length})
          </button>
          <button
            onClick={() => { playTapSound(); setActiveTab('REQUESTS'); }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-[7px] transition-all relative flex items-center justify-center gap-1.5 ${
              activeTab === 'REQUESTS'
                ? 'glass-surface text-white shadow-sm font-semibold border border-white/15'
                : 'text-[#8a8ea0] hover:text-white'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Requests</span>
            {pendingRequests.length > 0 && (
              <span className="unread-badge">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Sidebar Content Area with iOS Pull-To-Refresh */}
      <PullToRefresh
        onRefresh={async () => {
          playPullRefreshSound();
          await fetchConversations();
        }}
        pullingText="Pull to refresh chats"
        refreshingText="Updating chats..."
        className="flex-1 divide-y divide-white/5"
      >
        {/* LIVE SEARCH RESULTS DROPDOWN (When user types in search bar) */}
        {searchQuery.trim() !== '' && (
          <div className="p-3 bg-[#1C1C1E] border-b border-white/10 space-y-2">
            <h4 className="text-[11px] font-semibold text-[#8E8E93] uppercase tracking-wider px-1">
              Registered Users Matching &quot;{searchQuery}&quot; ({liveSearchUsers.length})
            </h4>

            {liveSearchUsers.length === 0 ? (
              <p className="text-xs text-[#8E8E93] p-2 italic">No registered Chat-Ko users found matching this query.</p>
            ) : (
              liveSearchUsers.map((matchedUser) => {
                const existingConv = conversations.find((c) =>
                  c.participants.some((p) => p.id === matchedUser.id)
                );

                const existingReq = messageRequests.find(
                  (r) =>
                    (r.senderId === user?.id && r.recipientId === matchedUser.id) ||
                    (r.senderId === matchedUser.id && r.recipientId === user?.id)
                );

                const isSending = requestStatusMap[matchedUser.id] === 'SENDING';
                const isSent = requestStatusMap[matchedUser.id] === 'SENT' || existingReq?.status === 'PENDING';

                return (
                  <div
                    key={matchedUser.id}
                    className="p-3 bg-[#2C2C2E]/60 hover:bg-[#2C2C2E] rounded-2xl border border-white/5 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={matchedUser.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${matchedUser.phoneNumber}`}
                        alt={matchedUser.name}
                        className="w-10 h-10 rounded-full bg-[#1C1C1E] object-cover border border-white/10"
                      />
                      <div className="min-w-0">
                        <h5 className="text-xs font-semibold text-[#F2F2F7] truncate">{matchedUser.name}</h5>
                        <p className="text-[11px] text-[#8E8E93] truncate font-mono">
                          {matchedUser.phoneNumber || matchedUser.email || 'Contact'}
                        </p>
                      </div>
                    </div>

                    {existingConv ? (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          selectConversation(existingConv.id);
                        }}
                        className="px-3.5 py-1.5 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-full text-xs font-medium flex-shrink-0 transition-all active:scale-95 shadow-sm"
                      >
                        Open
                      </button>
                    ) : existingReq?.status === 'PENDING' && existingReq.recipientId === user?.id ? (
                      <button
                        onClick={() => acceptRequest(existingReq.id)}
                        className="px-3 py-1.5 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white font-semibold rounded-full text-xs flex-shrink-0 transition-all shadow-md active:scale-95"
                      >
                        Accept
                      </button>
                    ) : isSent ? (
                      <span className="px-3 py-1 bg-white/5 text-[#8E8E93] rounded-full text-[11px] font-medium flex items-center gap-1 border border-white/5">
                        <Clock className="w-3 h-3 text-[#8E8E93]" />
                        <span>Pending</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSendRequest(matchedUser)}
                        disabled={isSending}
                        className="px-3 py-1.5 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-full text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm active:scale-95 flex-shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>{isSending ? 'Sending...' : 'Request'}</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 1: CHATS LIST */}
        {activeTab === 'CHATS' && (
          filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-[#8E8E93] h-64">
              <div className="w-14 h-14 bg-[#1C1C1E] rounded-full flex items-center justify-center text-[#8E8E93] mb-3 border border-white/5">
                <MessageSquarePlus className="w-6 h-6 text-[#0A84FF]" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">No conversations yet</p>
              <p className="text-xs max-w-xs mb-4 text-[#8E8E93] leading-relaxed">
                Pull down to refresh or tap search above to start a conversation.
              </p>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white px-4 py-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>New Conversation</span>
              </button>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              if (!conv || !conv.participants) return null;
              const otherParticipant = conv.participants.find((p) => p && p.id !== user?.id);
              const presence = otherParticipant ? userPresence[otherParticipant.id] : undefined;
              const myBlocked = (user as any)?.blockedUserIds || [];
              const recipientBlocked = presence?.blockedUserIds || [];

              const isBlockedByMe = otherParticipant ? myBlocked.includes(otherParticipant.id) : false;
              const isBlockedByThem = (otherParticipant && user?.id) ? recipientBlocked.includes(user.id) : false;
              const isBlocked = isBlockedByMe || isBlockedByThem;

              const displayName = isBlockedByThem
                ? 'Chat-Ko User'
                : otherParticipant?.name || 'Contact';

              const displayAvatar = isBlocked
                ? `https://api.dicebear.com/7.x/bottts/svg?seed=blocked_user`
                : otherParticipant?.avatarUrl || (otherParticipant?.phoneNumber ? `https://api.dicebear.com/7.x/bottts/svg?seed=${otherParticipant.phoneNumber}` : `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.id}`);

              const isOnline = !isBlocked && isUserOnline(presence);
              const isActive = activeConversationId === conv.id;
              const lastMsg = conv.lastMessage;

              return (
                <div
                  key={conv.id}
                  onClick={() => { playTapSound(); selectConversation(conv.id); }}
                  className={`p-3.5 flex items-center gap-3 cursor-pointer transition-all ios-press ${
                    isActive
                      ? 'conv-active'
                      : 'hover:bg-white/[0.06] active:bg-white/[0.10]'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={displayAvatar}
                      alt="Contact"
                      className="w-12 h-12 rounded-full bg-[#1C1C1E] object-cover border border-white/10 shadow-sm"
                    />
                    {isOnline && (
                      <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-400 border-2 border-black rounded-full shadow" />
                    )}
                  </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h3 className="text-sm font-semibold text-[#f0f2f7] truncate">
                    {displayName}
                  </h3>
                  <span className="text-[11px] text-[#8a8ea0] flex-shrink-0 font-normal">
                    {conv.updatedAt ? new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#8a8ea0]">
                  <p className="truncate pr-2 font-normal text-[#8a8ea0]">
                    {isBlockedByThem
                      ? 'Communications restricted'
                      : isBlockedByMe
                      ? 'User blocked'
                      : lastMsg
                      ? (lastMsg as any).decryptedText || (lastMsg as any).text || 'Message'
                      : 'Tap to start conversation'}
                  </p>
                </div>
              </div>
                </div>
              );
            })
          )
        )}

        {/* TAB 2: MESSAGE REQUESTS LIST */}
        {activeTab === 'REQUESTS' && (
          pendingRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-400 h-64">
              <Inbox className="w-12 h-12 text-zinc-500 mb-2 opacity-50" />
              <p className="text-sm font-semibold text-white mb-1">No incoming message requests</p>
              <p className="text-xs text-zinc-400">
                When someone sends you a message request, it will appear here.
              </p>
            </div>
          ) : (
            pendingRequests.map((req) => {
              const senderUser = allRegisteredUsers.find((u) => u.id === req.senderId);
              const displayName = senderUser?.name || req.senderName || 'Chat-Ko User';
              const displayAvatar = senderUser?.avatarUrl || req.senderAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${req.senderId}`;
              const displayInfo = senderUser?.phoneNumber || senderUser?.email || req.senderPhone || 'Contact';

              return (
                <div key={req.id} className="p-4 bg-white/5 border-b border-white/10 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={displayAvatar}
                      alt={displayName}
                      className="w-12 h-12 rounded-full bg-zinc-800 object-cover border border-white/10"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{displayName}</h4>
                      <p className="text-xs text-zinc-400 truncate">{displayInfo}</p>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => declineRequest(req.id)}
                      className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl text-xs font-bold transition-all active:scale-95"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => acceptRequest(req.id)}
                      className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept Request</span>
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
      </PullToRefresh>

      {/* New Chat & User Search Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="glass-panel border border-white/15 rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" />
                <span>Search Registered Users</span>
              </h2>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Search by Name, Email, or Phone Number
                </label>
                <input
                  type="text"
                  placeholder="Enter name (e.g. Alex), email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full glass-input border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white font-medium shadow-inner"
                  autoFocus
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {liveSearchUsers.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-4 italic">
                    {searchQuery.trim() ? 'No users found matching query.' : 'Type a name or phone number to see registered users.'}
                  </p>
                ) : (
                  liveSearchUsers.map((u) => (
                    <div key={u.id} className="p-3 bg-white/5 rounded-2xl flex items-center justify-between gap-2 border border-white/10">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={u.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.phoneNumber}`}
                          alt={u.name}
                          className="w-9 h-9 rounded-full bg-zinc-800 object-cover"
                        />
                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-white truncate">{u.name}</h5>
                          <p className="text-[10px] text-zinc-400 truncate">{u.phoneNumber || u.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          handleSendRequest(u);
                          setShowNewChatModal(false);
                        }}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1 transition-all"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Send Request</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
