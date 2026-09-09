import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Check,
  CheckCheck,
  Lock,
  PhoneCall,
  Video,
  MoreVertical,
  ArrowLeft,
  ChevronLeft,
  LockKeyhole,
  Trash2,
  Play,
  Pause,
  X,
  Ban,
  Ghost,
  UserX,
  UserCheck
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore, isUserOnline } from '../../store/useChatStore';
import { MessageInput } from './MessageInput';
import { CallModal } from './CallModal';
import { LocalMessageRecord } from '../../db/indexeddb';
import { PullToRefresh } from '../common/PullToRefresh';
import { playTapSound, playModalOpenSound, playModalCloseSound, playPullRefreshSound } from '../../lib/soundEffects';

interface ChatWindowProps {
  onBack?: () => void;
}

const AudioPlayerBubble: React.FC<{ src: string }> = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-3 p-1 min-w-[200px]">
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all shadow-md active:scale-95 flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
      </button>

      <div className="flex-1 flex items-center gap-1.5">
        <div className="flex gap-1 items-center h-6 flex-1">
          <span className={`w-1 h-3 bg-zinc-300 rounded-full ${isPlaying ? 'animate-bounce' : ''}`} />
          <span className={`w-1 h-5 bg-zinc-200 rounded-full ${isPlaying ? 'animate-bounce [animation-delay:0.15s]' : ''}`} />
          <span className={`w-1 h-2 bg-zinc-400 rounded-full ${isPlaying ? 'animate-bounce [animation-delay:0.3s]' : ''}`} />
          <span className={`w-1 h-6 bg-zinc-200 rounded-full ${isPlaying ? 'animate-bounce [animation-delay:0.45s]' : ''}`} />
          <span className={`w-1 h-4 bg-zinc-300 rounded-full ${isPlaying ? 'animate-bounce [animation-delay:0.6s]' : ''}`} />
          <span className={`w-1 h-3 bg-zinc-400 rounded-full ${isPlaying ? 'animate-bounce [animation-delay:0.75s]' : ''}`} />
        </div>
        <span className="text-xs text-zinc-300 font-semibold ml-1">Voice Note</span>
      </div>
    </div>
  );
};

const MediaVideoNoteBubble: React.FC<{ src: string; frameStyle?: string | null; caption?: string | null }> = ({ src, frameStyle, caption }) => {
  const [blobUrl, setBlobUrl] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!src) return;
    if (src.startsWith('blob:')) {
      setBlobUrl(src);
      return;
    }
    if (src.startsWith('data:')) {
      try {
        const parts = src.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'video/webm';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      } catch (e) {
        console.error('Failed to create video blob URL:', e);
        setBlobUrl(src);
      }
    } else {
      setBlobUrl(src);
    }
  }, [src]);

  useEffect(() => {
    if (blobUrl && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [blobUrl]);

  return (
    <div className="flex flex-col items-center p-1 space-y-2 select-none">
      <div
        className={`w-40 h-40 sm:w-52 sm:h-52 overflow-hidden relative group bg-black transition-all cursor-pointer ${
          frameStyle === 'CYBER_NEON'
            ? 'rounded-3xl border-4 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.7)] ring-2 ring-fuchsia-500/50'
            : frameStyle === 'RETRO_POLAROID'
            ? 'rounded-2xl border-[10px] border-zinc-100 shadow-2xl bg-zinc-100'
            : frameStyle === 'GOLD_LUXURY'
            ? 'rounded-[2rem] border-4 border-amber-300/90 shadow-[0_0_30px_rgba(252,211,77,0.6)] ring-4 ring-amber-500/30'
            : 'rounded-full border-4 border-pink-400/80 shadow-[0_0_25px_rgba(244,114,182,0.6)] ring-4 ring-pink-300/30'
        }`}
        onClick={() => {
          if (videoRef.current) {
            if (videoRef.current.paused) {
              videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
        }}
      >
        {blobUrl ? (
          <video
            ref={videoRef}
            src={blobUrl}
            controls
            playsInline
            autoPlay
            muted
            loop
            className="w-full h-full object-cover pointer-events-auto"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
            Loading video...
          </div>
        )}
      </div>
      {caption &&
        caption !== '🎥 10s Video Note' &&
        !caption.startsWith('data:') &&
        !caption.startsWith('blob:') && (
          <p className="text-xs text-center font-semibold text-pink-200 max-w-xs break-words">
            {caption}
          </p>
        )}
    </div>
  );
};

const MediaImageBubble: React.FC<{ src: string; caption?: string | null; onImageClick: (url: string) => void }> = ({ src, caption, onImageClick }) => {
  const [blobUrl, setBlobUrl] = useState<string>('');

  useEffect(() => {
    if (!src) return;
    if (src.startsWith('blob:')) {
      setBlobUrl(src);
      return;
    }
    if (src.startsWith('data:')) {
      try {
        const parts = src.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      } catch (e) {
        console.error('Failed to create image blob URL:', e);
        setBlobUrl(src);
      }
    } else {
      setBlobUrl(src);
    }
  }, [src]);

  return (
    <div className="space-y-2">
      {blobUrl ? (
        <img
          src={blobUrl}
          alt="Attachment"
          onClick={() => onImageClick(blobUrl)}
          className="rounded-xl max-h-64 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity border border-white/10"
        />
      ) : (
        <div className="w-full h-48 bg-black/40 rounded-xl flex items-center justify-center text-xs text-zinc-400">
          Loading photo...
        </div>
      )}
      {caption && caption !== '📷 Photo' && !caption.startsWith('data:') && !caption.startsWith('blob:') && (
        <p className="text-sm leading-relaxed font-normal">{caption}</p>
      )}
    </div>
  );
};

export const ChatWindow: React.FC<ChatWindowProps> = ({ onBack }) => {
  const { user, blockUser, unblockUser } = useAuthStore();
  const {
    conversations,
    activeConversationId,
    messages,
    typingStatus,
    remoteTypingStatus,
    userPresence,
    setSafetyVerifyContact,
    sendMessage,
    deleteMessage,
    startCall,
    messageRequests,
    acceptRequest,
    setTyping
  } = useChatStore();

  const [replyToMessage, setReplyToMessage] = useState<LocalMessageRecord | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<'AUDIO' | 'VIDEO' | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [whisperTimer, setWhisperTimer] = useState<number>(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef<boolean>(true);  // true until first scroll for this conv
  const lastConvIdRef = useRef<string | null>(null); // tracks which conv was last loaded
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const otherUser = activeConv?.participants?.find((p) => p && p.id !== user?.id);
  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
  // Bug 5: read OTHER participant's typing state from Firestore (remoteTypingStatus),
  // not our own local typingStatus which only reflects our own keyboard input
  const isTyping = activeConversationId ? (remoteTypingStatus[activeConversationId] ?? false) : false;

  // Bug 3: reset initial-load flag whenever the active conversation changes
  useEffect(() => {
    if (activeConversationId !== lastConvIdRef.current) {
      isInitialLoadRef.current = true;
      lastConvIdRef.current = activeConversationId;
    }
  }, [activeConversationId]);

  // Bug 3: smart scroll — instant on initial load, smooth only for new messages near bottom
  useEffect(() => {
    const end = messagesEndRef.current;
    const container = scrollContainerRef.current;
    if (!end) return;

    if (isInitialLoadRef.current) {
      // First time this conversation's messages populate: jump instantly, no animation
      end.scrollIntoView({ behavior: 'auto' });
      isInitialLoadRef.current = false;
      return;
    }

    // Subsequent updates (new messages): only auto-scroll if user is near the bottom
    if (container) {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom < 200) {
        end.scrollIntoView({ behavior: 'smooth' });
      }
      // If user scrolled up to read old messages, don't interrupt them
    } else {
      end.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, isTyping]);

  if (!activeConv || !otherUser) {
    return (
      <div className="flex-1 bg-transparent hidden md:flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        <div className="glass-card border border-white/10 rounded-3xl p-8 max-w-md flex flex-col items-center shadow-2xl relative fade-scale-in">
          <div className="w-20 h-20 glass-surface border border-white/15 rounded-2xl flex items-center justify-center text-[#4f8ef7] mb-5 shadow-lg">
            <LockKeyhole className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-light text-white mb-1 tracking-tight">
            Chat-Ko <span className="font-semibold text-[#4f8ef7]">Glass</span>
          </h2>
          <p className="text-xs text-[#8a8ea0] max-w-xs mb-5 leading-relaxed">
            Select a conversation or search users to start real-time end-to-end encrypted messaging.
          </p>
          <div className="flex items-center gap-2 text-[11px] text-[#8a8ea0] bg-white/5 px-4 py-2 rounded-full border border-white/10 font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-[#4f8ef7]" />
            <span>X3DH + Double Ratchet • Zero-Knowledge</span>
          </div>
        </div>
      </div>
    );
  }

  const presence = userPresence[otherUser.id];
  const isBlockedByMe = ((user as any)?.blockedUserIds || []).includes(otherUser.id);
  const isBlockedByThem = ((presence as any)?.blockedUserIds || []).includes(user?.id) || false;
  const isBlocked = isBlockedByMe || isBlockedByThem;

  const pendingReq = messageRequests.find(
    (r) => (r.senderId === user?.id && r.recipientId === otherUser.id) ||
           (r.senderId === otherUser.id && r.recipientId === user?.id)
  );

  const headerAvatar = isBlocked
    ? 'https://api.dicebear.com/7.x/bottts/svg?seed=blocked_user'
    : otherUser.avatarUrl || (otherUser.phoneNumber ? `https://api.dicebear.com/7.x/bottts/svg?seed=${otherUser.phoneNumber}` : `https://api.dicebear.com/7.x/bottts/svg?seed=${otherUser.id}`);

  const headerName = isBlockedByThem
    ? 'Chat-Ko User'
    : otherUser.name || 'Chat-Ko Contact';

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (touchStartX.current < 60 && deltaX > 70 && Math.abs(deltaY) < 50) {
      if (onBack) onBack();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const formatMessageTime = (dateStr: any) => {
    try {
      if (!dateStr) return '';
      if (typeof dateStr === 'object' && dateStr.seconds) {
        return new Date(dateStr.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const cycleWhisperTimer = () => {
    if (whisperTimer === 0) setWhisperTimer(10);
    else if (whisperTimer === 10) setWhisperTimer(30);
    else if (whisperTimer === 30) setWhisperTimer(300);
    else setWhisperTimer(0);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex-1 bg-transparent flex flex-col h-full overflow-hidden relative select-none"
    >
      {/* iOS Top App Bar */}
      <div className="h-16 px-4 glass-header flex items-center justify-between flex-shrink-0 z-10 shadow-sm safe-top">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center md:hidden text-[#0A84FF] hover:bg-white/10 rounded-full transition-all ios-press flex-shrink-0 -ml-2"
              title="Back"
            >
              <ChevronLeft className="w-7 h-7" />
            </button>
          )}
          <img
            src={headerAvatar}
            alt="Contact"
            className="w-10 h-10 rounded-full bg-[#1C1C1E] object-cover ring-2 ring-white/15 shadow-sm flex-shrink-0"
          />
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-[#F2F2F7] line-clamp-1">{headerName}</h2>
            <div className="text-[11px] text-[#8a8ea0] truncate">
              {isBlocked ? (
                <span>offline</span>
              ) : isTyping ? (
                <span className="text-[#4f8ef7] font-medium">typing...</span>
              ) : isUserOnline(presence) ? (
                <span className="text-emerald-400 font-medium">online</span>
              ) : (
                <span>{otherUser.phoneNumber || (otherUser as any).email || 'Chat-Ko Contact'}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-300 relative">
          {/* Whisper Mode Toggle */}
          <button
            onClick={cycleWhisperTimer}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              whisperTimer > 0
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm animate-pulse'
                : 'bg-white/5 text-[#8a8ea0] border-white/10 hover:text-white'
            }`}
            title="Toggle Whisper Disappearing Mode"
          >
            <Ghost className="w-4 h-4" />
            <span>{whisperTimer > 0 ? `${whisperTimer}s` : 'Whisper'}</span>
          </button>

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl transition-all active:scale-95"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 glass-panel border border-white/15 rounded-2xl shadow-2xl z-50 p-1 divide-y divide-white/10">
                <button
                  onClick={() => {
                    setSafetyVerifyContact(otherUser);
                    setShowMoreMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/10 rounded-xl flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-zinc-300" />
                  <span>Verify E2EE Safety Code</span>
                </button>

                {isBlocked ? (
                  <button
                    onClick={() => {
                      unblockUser(otherUser.id);
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-emerald-400 hover:bg-white/10 rounded-xl flex items-center gap-2 font-semibold"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Unblock User</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`Block ${otherUser.name}?`)) {
                        blockUser(otherUser.id);
                      }
                      setShowMoreMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-xl flex items-center gap-2 font-semibold"
                  >
                    <UserX className="w-4 h-4" />
                    <span>Block User</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Security Info Banner */}
      <div className="py-1.5 px-4 bg-white/[0.03] border-b border-white/[0.07] text-center text-[11px] text-[#8a8ea0] flex items-center justify-center gap-1.5">
        <Lock className="w-3 h-3 flex-shrink-0 text-[#4f8ef7]" />
        <span>
          {whisperTimer > 0
            ? `👻 Whisper Mode: Messages self-destruct after ${whisperTimer}s`
            : 'Double Ratchet E2EE · Only you and this contact can read messages'}
        </span>
      </div>

      {/* Blocked Contact Warning Banner */}
      {isBlockedByMe ? (
        <div className="p-3 bg-red-500/15 border-b border-red-500/30 text-center text-xs text-red-300 flex items-center justify-center gap-2 shadow-inner">
          <Ban className="w-4 h-4 text-red-400" />
          <span>You have blocked this user.</span>
          <button
            onClick={() => unblockUser(otherUser.id)}
            className="underline font-bold text-white hover:text-red-200 ml-1"
          >
            Unblock
          </button>
        </div>
      ) : isBlockedByThem ? (
        <div className="p-3 bg-red-500/15 border-b border-red-500/30 text-center text-xs text-red-300 flex items-center justify-center gap-2 shadow-inner font-semibold">
          <Ban className="w-4 h-4 text-red-400" />
          <span>This contact has restricted communications. You cannot message or call them.</span>
        </div>
      ) : null}

      {/* Message Request Pending Banner */}
      {pendingReq && pendingReq.status === 'PENDING' && (
        <div className="p-3 bg-emerald-500/15 border-b border-emerald-500/30 text-center text-xs text-emerald-300 flex items-center justify-center gap-3 shadow-inner font-medium">
          {pendingReq.recipientId === user?.id ? (
            <>
              <span>This user sent you a message request.</span>
              <button
                onClick={() => acceptRequest(pendingReq.id)}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-lg shadow transition-all active:scale-95"
              >
                Accept Request
              </button>
            </>
          ) : (
            <span>Message Request Sent: Waiting for recipient to accept.</span>
          )}
        </div>
      )}

      {/* Messages Stream with iOS Pull-To-Refresh for pagination */}
      <PullToRefresh
        onRefresh={async () => {
          await new Promise((res) => setTimeout(res, 350));
        }}
        pullingText="Pull for older messages"
        refreshingText="Loading messages..."
        className="flex-1 p-4 space-y-2.5 bg-transparent"
      >
        {activeMessages.map((msg) => {
          const isSent = msg.senderId === user?.id;

          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className={`flex ${isSent ? 'justify-end' : 'justify-start'} group items-center gap-2`}
            >
              {/* Delete Button for Sent Messages */}
              {isSent && !msg.isDeleted && (
                <button
                  onClick={() => {
                    if (confirm('Delete this message for everyone?')) {
                      deleteMessage(msg.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#8E8E93] hover:text-red-400 hover:bg-white/10 rounded-full transition-all"
                  title="Delete message"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[72%] p-3 shadow-md relative transition-all ${
                  msg.isDeleted
                    ? 'bg-white/5 border border-white/10 text-[#8a8ea0] italic rounded-[18px]'
                    : isSent
                    ? 'bubble-sent'
                    : 'bubble-received'
                }`}
              >
                {/* Quoted Reply */}
                {msg.replyToId && !msg.isDeleted && (
                  <div className="mb-2 p-2 bg-black/30 border-l-4 border-white/30 rounded-lg text-xs text-[#8E8E93]">
                    <p className="font-bold text-white text-[11px]">Quoted Message</p>
                  </div>
                )}

                {/* Message Content rendering: Deleted / Image / Video Note / Voice / Text */}
                {msg.isDeleted ? (
                  <div className="flex items-center gap-2 text-xs text-[#8E8E93] py-0.5">
                    <Ban className="w-4 h-4 text-[#8E8E93] flex-shrink-0" />
                    <span>This message was deleted</span>
                  </div>
                ) : (msg.messageType === 'VIDEO_NOTE' || (msg.decryptedText && (msg.decryptedText.startsWith('data:video') || msg.decryptedText.startsWith('blob:')))) && (msg.mediaUrl || (msg.decryptedText && (msg.decryptedText.startsWith('data:video') || msg.decryptedText.startsWith('blob:')))) ? (
                  <MediaVideoNoteBubble
                    src={msg.mediaUrl || msg.decryptedText || ''}
                    frameStyle={msg.frameStyle}
                    caption={msg.decryptedText}
                  />
                ) : (msg.messageType === 'IMAGE' || (msg.decryptedText && msg.decryptedText.startsWith('data:image'))) && ((msg.mediaUrl && (msg.mediaUrl.startsWith('data:image') || msg.mediaUrl.startsWith('blob:') || msg.mediaUrl.startsWith('http'))) || (msg.decryptedText && msg.decryptedText.startsWith('data:image'))) ? (
                  <MediaImageBubble
                    src={msg.mediaUrl || msg.decryptedText || ''}
                    caption={msg.decryptedText}
                    onImageClick={(url) => setLightboxImage(url)}
                  />
                ) : ((msg.messageType as any) === 'AUDIO' || msg.messageType === 'VOICE') && ((msg.mediaUrl && (msg.mediaUrl.startsWith('data:audio') || msg.mediaUrl.startsWith('blob:') || msg.mediaUrl.startsWith('http'))) || (msg.decryptedText && msg.decryptedText.startsWith('data:audio'))) ? (
                  <AudioPlayerBubble src={msg.mediaUrl || msg.decryptedText || ''} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed break-words pr-12 font-normal">
                    {msg.decryptedText && msg.decryptedText !== '[Encrypted Message]'
                      ? msg.decryptedText
                      : msg.text && msg.text !== '[Encrypted Message]'
                      ? msg.text
                      : msg.isDecrypted === false
                      ? '⚠️ Unable to decrypt this message'
                      : '🔒 Encrypted message'}
                  </p>
                )}

                <div className="flex items-center justify-end gap-1 text-[10px] mt-1 float-right font-normal">
                  <span className={isSent ? 'text-white/70' : 'text-[#8E8E93]'}>{formatMessageTime(msg.createdAt)}</span>
                  {isSent && !msg.isDeleted && (
                    <span>
                      {msg.status === 'READ' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-white" />
                      ) : msg.status === 'DELIVERED' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-white/80" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-white/70" />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="bubble-received px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#8a8ea0] rounded-full typing-dot-1" />
              <span className="w-2 h-2 bg-[#8a8ea0] rounded-full typing-dot-2" />
              <span className="w-2 h-2 bg-[#8a8ea0] rounded-full typing-dot-3" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </PullToRefresh>

      {/* Fullscreen Image Lightbox Modal */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4">
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white hover:text-zinc-300 p-2 bg-white/10 rounded-full"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Full view"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl border border-white/10"
          />
        </div>
      )}

      {/* Message Input Toolbar (Disabled if Blocked) */}
      {!isBlocked ? (
        <MessageInput
          onSend={(text, type, media) => sendMessage(text, replyToMessage?.id, type, media)}
          onTyping={(isTyping) => setTyping(isTyping)}
          replyMessage={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
        />
      ) : (
        <div className="p-4 glass-header border-t border-white/10 text-center text-xs text-zinc-400 font-semibold">
          {isBlockedByMe
            ? 'You have blocked this user. Unblock to send messages or media.'
            : 'Messaging unavailable. Communications are restricted by this contact.'}
        </div>
      )}
    </div>
  );
};
