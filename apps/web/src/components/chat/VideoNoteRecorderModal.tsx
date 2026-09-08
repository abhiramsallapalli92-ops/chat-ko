import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, RefreshCw, Send, Sparkles, Heart, Zap, Award, StopCircle } from 'lucide-react';

export type FrameStyle = 'PASTEL_HEART' | 'CYBER_NEON' | 'RETRO_POLAROID' | 'GOLD_LUXURY';

interface VideoNoteRecorderModalProps {
  onClose: () => void;
  onSend: (text: string, messageType: 'VIDEO_NOTE', mediaUrl: string, frameStyle: FrameStyle) => void;
}

const FRAMES: Array<{ id: FrameStyle; label: string; icon: any; borderClass: string; containerClass: string }> = [
  {
    id: 'PASTEL_HEART',
    label: 'Pastel Heart',
    icon: Heart,
    borderClass: 'border-4 border-pink-400/80 shadow-[0_0_25px_rgba(244,114,182,0.6)] ring-4 ring-pink-300/30',
    containerClass: 'rounded-full aspect-square overflow-hidden',
  },
  {
    id: 'CYBER_NEON',
    label: 'Cyber Neon',
    icon: Zap,
    borderClass: 'border-4 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.7)] ring-2 ring-fuchsia-500/50',
    containerClass: 'rounded-3xl aspect-square overflow-hidden',
  },
  {
    id: 'RETRO_POLAROID',
    label: 'Retro Film',
    icon: Sparkles,
    borderClass: 'border-[10px] border-zinc-100 shadow-2xl pb-6 bg-zinc-100 text-zinc-900',
    containerClass: 'rounded-2xl aspect-[4/5] overflow-hidden',
  },
  {
    id: 'GOLD_LUXURY',
    label: 'Gold Luxury',
    icon: Award,
    borderClass: 'border-4 border-amber-300/90 shadow-[0_0_30px_rgba(252,211,77,0.6)] ring-4 ring-amber-500/30',
    containerClass: 'rounded-[2rem] aspect-square overflow-hidden',
  },
];

export const VideoNoteRecorderModal: React.FC<VideoNoteRecorderModalProps> = ({ onClose, onSend }) => {
  const [mounted, setMounted] = useState(false);
  const [frameStyle, setFrameStyle] = useState<FrameStyle>('PASTEL_HEART');
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize camera stream with compact video resolution
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 360 }, height: { ideal: 360 }, facingMode: 'user' },
          audio: true,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setPermissionError('Camera and Microphone permission required to record video notes.');
      }
    }
    startCamera();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Handle Recording 10 Seconds max at compressed 180 Kbps bitrate
  const startRecording = () => {
    if (!streamRef.current) return;

    try {
      let options: MediaRecorderOptions = { videoBitsPerSecond: 180000 };
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options = { mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 180000 };
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4', videoBitsPerSecond: 180000 };
      }

      const recorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = recorder;
      videoChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          videoChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedVideoUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(100);
      setIsRecording(true);
      setTimeLeft(10);

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = Math.max(0, 10 - elapsed);
        setTimeLeft(Math.ceil(remaining));

        if (remaining <= 0) {
          stopRecording();
        }
      }, 100);
    } catch (err) {
      console.error('Failed to start MediaRecorder:', err);
      alert('Could not start video recorder.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleRetake = () => {
    setRecordedVideoUrl(null);
    setIsRecording(false);
    setTimeLeft(10);
    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }, 100);
  };

  const handleSendVideoNote = () => {
    if (!recordedVideoUrl) return;
    onSend(caption.trim() || '🎥 10s Video Note', 'VIDEO_NOTE', recordedVideoUrl, frameStyle);
    onClose();
  };

  const currentFrameObj = FRAMES.find((f) => f.id === frameStyle) || FRAMES[0];

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[9999] flex items-center justify-center p-3 select-none overflow-y-auto animate-in fade-in duration-200">
      <div className="glass-panel border border-white/20 rounded-3xl w-full max-w-xs sm:max-w-sm p-4 sm:p-5 shadow-2xl relative max-h-[88vh] overflow-y-auto flex flex-col items-center my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-400 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition-all z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
          <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">10s Cute Video Note</h2>
        </div>

        {permissionError ? (
          <div className="p-3 text-center text-red-300 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs font-semibold my-3">
            {permissionError}
          </div>
        ) : (
          <>
            {/* Live Camera View with Selected Cute Frame */}
            <div className="relative my-2 flex items-center justify-center w-36 h-36 sm:w-48 sm:h-48 flex-shrink-0">
              <div className={`relative w-36 h-36 sm:w-48 sm:h-48 ${currentFrameObj.containerClass} ${currentFrameObj.borderClass} transition-all duration-300 shadow-2xl`}>
                {recordedVideoUrl ? (
                  <video
                    ref={previewVideoRef}
                    src={recordedVideoUrl}
                    autoPlay
                    loop
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                )}

                {/* Live Recording Countdown Badge */}
                {isRecording && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold text-red-400 border border-red-500/40 flex items-center gap-1 animate-pulse">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                    <span>00:0{timeLeft}s</span>
                  </div>
                )}
              </div>

              {/* Polaroid Handwritten Label */}
              {frameStyle === 'RETRO_POLAROID' && (
                <div className="absolute bottom-0.5 text-[9px] font-serif font-bold text-zinc-700 tracking-wider">
                  ✨ Video Note ✨
                </div>
              )}
            </div>

            {/* Frame Selector Buttons */}
            {!recordedVideoUrl && !isRecording && (
              <div className="w-full my-2">
                <label className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider text-center mb-1">
                  Choose Frame
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {FRAMES.map((f) => {
                    const IconComp = f.icon;
                    const isActive = frameStyle === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFrameStyle(f.id)}
                        className={`p-1.5 rounded-xl flex flex-col items-center gap-0.5 border transition-all text-xs font-bold ${
                          isActive
                            ? 'bg-white/20 text-white border-pink-400/60 shadow scale-105'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200'
                        }`}
                      >
                        <IconComp className="w-3.5 h-3.5" />
                        <span className="text-[8px]">{f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full mt-2">
              {recordedVideoUrl ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Add a cute caption (optional)..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    className="w-full glass-input text-xs text-white placeholder-zinc-400 px-3 py-2 rounded-xl border border-white/10 focus:border-pink-300 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-zinc-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Re-record</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendVideoNote}
                      className="flex-1 py-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg active:scale-95"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Note</span>
                    </button>
                  </div>
                </div>
              ) : isRecording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xl animate-pulse active:scale-95"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Stop Recording ({timeLeft}s)</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-full py-2.5 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 hover:opacity-90 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95"
                >
                  <Camera className="w-4 h-4" />
                  <span>Record 10s Video Note</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};
