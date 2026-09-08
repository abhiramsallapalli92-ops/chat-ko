import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, X, Mic, Image as ImageIcon, Trash2, Video } from 'lucide-react';
import { LocalMessageRecord } from '../../db/indexeddb';
import { compressImage } from '../../lib/imageCompressor';
import { VideoNoteRecorderModal, FrameStyle } from './VideoNoteRecorderModal';
import { playTapSound } from '../../lib/soundEffects';

interface MessageInputProps {
  onSend: (text: string, messageType?: 'TEXT' | 'IMAGE' | 'VOICE' | 'VIDEO_NOTE', mediaUrl?: string, frameStyle?: string) => void;
  onTyping: (isTyping: boolean) => void;
  replyMessage?: LocalMessageRecord | null;
  onCancelReply?: () => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onTyping,
  replyMessage,
  onCancelReply,
}) => {
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showVideoNoteModal, setShowVideoNoteModal] = useState(false);

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);

  const composerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);
  const lastSendTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

  // VisualViewport API handling to sit flush above mobile software keyboard
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const handleViewportChange = () => {
      const composer = composerRef.current;
      if (!composer) return;
      const offsetFromBottom = window.innerHeight - (vv.height + vv.offsetTop);
      composer.style.transform = `translateY(-${Math.max(offsetFromBottom, 0)}px)`;
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    handleViewportChange();

    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);

    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Image size should be under 10MB');
        return;
      }
      try {
        const compressed = await compressImage(file, 800, 0.75);
        setSelectedImage(compressed);
      } catch (err) {
        console.error('Failed to compress image:', err);
      }
    }
  };

  // Start Audio Recording
  const startRecording = async () => {
    // Guard against ghost-clicks after sending a message
    if (Date.now() - lastSendTimeRef.current < 600) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          onSend('🎵 Voice Note', 'VOICE', base64Audio);
        };
        reader.readAsDataURL(audioBlob);

        // Stop media tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access error:', err);
      alert('Could not access microphone for voice message');
    }
  };

  // Stop Audio Recording & Send
  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  // Cancel Audio Recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Detach listener so it doesn't send
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      audioChunksRef.current = [];
    }
  };

  const handleSend = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    lastSendTimeRef.current = Date.now();
    playTapSound();

    if (selectedImage) {
      onSend(text.trim() || '📷 Photo', 'IMAGE', selectedImage);
      setSelectedImage(null);
      setText('');
      if (onCancelReply) onCancelReply();
      // Keep keyboard open without blur
      inputRef.current?.focus();
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    if (!text.trim()) return;

    onSend(text.trim(), 'TEXT');
    setText('');
    onTyping(false);
    if (onCancelReply) onCancelReply();

    // Explicitly re-focus input immediately to keep keyboard open like WhatsApp/Instagram
    inputRef.current?.focus();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={composerRef}
      className="w-full max-w-full glass-surface border-t border-white/10 p-2 sm:p-2.5 shadow-lg z-10 select-none safe-bottom overflow-x-hidden box-border transition-transform duration-100 ease-out"
    >
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        className="hidden"
      />

      {/* Video Note Recorder Modal */}
      {showVideoNoteModal && (
        <VideoNoteRecorderModal
          onClose={() => setShowVideoNoteModal(false)}
          onSend={(caption, msgType, mediaUrl, frameStyle) => {
            onSend(caption, msgType, mediaUrl, frameStyle);
          }}
        />
      )}

      {/* Reply Preview */}
      {replyMessage && (
        <div className="mb-2 p-2.5 bg-[#1C1C1E] rounded-xl flex items-center justify-between border-l-4 border-[#0A84FF] shadow-inner">
          <div className="text-xs text-[#8E8E93] truncate">
            <span className="font-semibold text-[#F2F2F7] block mb-0.5">Replying to message</span>
            <span className="text-white font-normal">{replyMessage.decryptedText}</span>
          </div>
          <button onClick={onCancelReply} className="text-[#8E8E93] hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image Preview Modal Card */}
      {selectedImage && (
        <div className="mb-3 p-3 bg-[#1C1C1E] rounded-2xl border border-white/15 relative flex items-center gap-3">
          <img src={selectedImage} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-white/20" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-white mb-1">Image attached</p>
            <p className="text-[11px] text-[#8E8E93]">Ready to send with end-to-end encryption</p>
          </div>
          <button
            onClick={() => setSelectedImage(null)}
            className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-full transition-all min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Audio Recording Active Toolbar */}
      {isRecording ? (
        <div className="flex items-center justify-between bg-[#1C1C1E] px-4 py-2.5 rounded-full border border-red-500/30 animate-pulse">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping shrink-0" />
            <span className="text-xs font-mono font-semibold text-red-400 truncate">
              Voice Note {formatRecordingTime(recordingTime)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-full transition-all active:scale-95"
              title="Cancel Recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={stopRecordingAndSend}
              className="p-2 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs font-semibold px-3"
              title="Send Voice Note"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSend} className="w-full max-w-full flex items-center gap-1 sm:gap-1.5 overflow-hidden">
          <div className="shrink-0 flex items-center gap-0.5 text-[#0A84FF]">
            <button
              type="button"
              onClick={() => setShowVideoNoteModal(true)}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 text-[#0A84FF] rounded-full transition-all active:scale-95 shrink-0"
              title="Record 10s Cute Video Note"
            >
              <Video className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 text-[#0A84FF] rounded-full transition-all active:scale-95 shrink-0"
              title="Attach Photo"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-white/10 text-[#0A84FF] rounded-full transition-all active:scale-95 shrink-0"
              title="Attach File"
            >
              <Paperclip className="w-5 h-5" />
            </button>
          </div>

          <input
            ref={inputRef}
            type="text"
            placeholder={selectedImage ? 'Add caption...' : 'iMessage'}
            value={text}
            onChange={handleInputChange}
            className="flex-1 min-w-0 bg-[#1C1C1E] text-base md:text-sm text-[#F2F2F7] placeholder-[#8E8E93] px-3.5 sm:px-4 py-2 rounded-full border border-white/10 focus:border-[#0A84FF]/60 focus:outline-none transition-colors shadow-inner font-normal"
          />

          {/* iOS Unified Action Button */}
          <button
            type={text.trim() || selectedImage ? 'submit' : 'button'}
            onMouseDown={(e) => e.preventDefault()}
            onTouchStart={(e) => {
              if (text.trim() || selectedImage) {
                e.preventDefault();
                handleSend();
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              if (text.trim() || selectedImage) {
                handleSend();
              } else {
                startRecording();
              }
            }}
            className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all active:scale-90 shrink-0 ${
              text.trim() || selectedImage
                ? 'bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white shadow-md shadow-[#0A84FF]/30'
                : 'bg-[#1C1C1E] text-[#8E8E93] hover:text-white border border-white/10'
            }`}
            title={text.trim() || selectedImage ? 'Send Message' : 'Record Voice Note'}
          >
            {text.trim() || selectedImage ? (
              <Send className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white ml-0.5" />
            ) : (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-[#8E8E93]" />
            )}
          </button>
        </form>
      )}
    </div>
  );
};
