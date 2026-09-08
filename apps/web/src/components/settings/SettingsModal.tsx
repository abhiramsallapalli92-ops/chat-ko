import React, { useState, useRef, useEffect } from 'react';
import ReactDom from 'react-dom';
import { X, Shield, LogOut, Check, Camera, Upload, Volume2, VolumeX } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { compressImage } from '../../lib/imageCompressor';
import { isSoundEnabled, setSoundEnabled, playSentSound, playModalOpenSound, playModalCloseSound } from '../../lib/soundEffects';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { user, updateUser, logout, deviceKeys } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saved, setSaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [soundActive, setSoundActive] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
    setSoundActive(isSoundEnabled());
    playModalOpenSound();
  }, []);

  const handleClose = () => {
    playModalCloseSound();
    onClose();
  };

  const toggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
    if (next) playSentSound();
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Profile picture size should be under 10MB');
        return;
      }
      try {
        const compressed = await compressImage(file, 250, 0.85);
        setAvatarUrl(compressed);
      } catch (err) {
        console.error('Failed to compress avatar image', err);
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUser({ name: name.trim(), bio: bio.trim(), avatarUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  if (!mounted) return null;

  return ReactDom.createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none safe-top safe-bottom">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarFileSelect}
        accept="image/*"
        className="hidden"
      />

      <div className="glass-panel border border-white/15 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative overflow-y-auto max-h-[90dvh]">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#4f8ef7]" />
            <span>Settings &amp; Profile</span>
          </h2>
          <button onClick={handleClose} className="text-[#8a8ea0] hover:text-white w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors ios-press">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Profile Photo & Info
            </h3>

            <div className="flex items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <img
                  src={avatarUrl || user?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.phoneNumber}`}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-white/20 object-cover shadow-lg"
                />
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/10 min-h-[44px]"
              >
                <Upload className="w-4 h-4" />
                <span>Upload Custom Picture</span>
              </button>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-semibold">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full glass-input rounded-xl px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:border-zinc-300 shadow-inner"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-semibold">About / Status</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full glass-input rounded-xl px-4 py-3 text-base md:text-sm text-white focus:outline-none focus:border-zinc-300 shadow-inner"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 text-white text-xs font-semibold px-4 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-zinc-600/50 shadow-md active:scale-95 min-h-[44px]"
              >
                <Check className="w-4 h-4" />
                <span>{saved ? 'Saved!' : 'Save Profile'}</span>
              </button>
            </div>
          </form>

          {/* Security & E2EE Info */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Encryption Protocol
            </h3>
            <div className="glass-card p-3 rounded-2xl border border-white/10 text-xs space-y-2">
              <div className="flex justify-between items-center text-zinc-400">
                <span>E2EE Key Registration ID</span>
                <span className="font-mono text-white text-[11px]">{deviceKeys?.registrationId || 'Active'}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Encryption Engine</span>
                <span className="text-[#4f8ef7] font-semibold text-[11px]">X3DH + Double Ratchet</span>
              </div>
            </div>
          </div>

          {/* Sound & Notifications */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Audio & Haptics
            </h3>
            <div className="glass-card p-3.5 rounded-2xl border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${soundActive ? 'bg-[#4f8ef7]/20 text-[#4f8ef7]' : 'bg-white/5 text-[#8a8ea0]'}`}>
                {soundActive ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </div>
                <div>
                  <p className="text-xs font-semibold text-white">In-App Sound Effects</p>
                  <p className="text-[11px] text-[#8E8E93]">Play subtle sounds for sent & received messages</p>
                </div>
              </div>
              <button
                type="button"
                onClick={toggleSound}
                className={`w-12 h-7 flex items-center rounded-full p-1 transition-colors duration-200 ease-in-out ${
                  soundActive ? 'bg-[#4f8ef7]' : 'bg-[#3A3A3C]'
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    soundActive ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-white/10 flex justify-between items-center flex-wrap gap-2">
            <span className="text-xs text-zinc-400">Chat-Ko PWA</span>
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors min-h-[44px]"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out & Clear Keys</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
