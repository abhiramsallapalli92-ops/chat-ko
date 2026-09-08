import React, { useState, useRef } from 'react';
import { User, Camera, Check, RefreshCw, Upload, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { compressImage } from '../../lib/imageCompressor';

interface ProfileSetupModalProps {
  onComplete: () => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onComplete }) => {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || 'Hey there! I am using Chat-Ko.');
  const [avatarUrl, setAvatarUrl] = useState(
    user?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.phoneNumber || 'default'}`
  );
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await updateUser({
        name: name.trim(),
        bio: bio.trim(),
        avatarUrl,
      });
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setLoading(false);
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarFileSelect}
        accept="image/*"
        className="hidden"
      />

      <div className="glass-panel border border-white/15 rounded-3xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-500 via-zinc-200 to-zinc-600" />

        <h2 className="text-xl font-bold text-white text-center mb-1 flex items-center justify-center gap-1.5 pt-2">
          <span>Set Up Your Profile</span>
          <Sparkles className="w-4 h-4 text-zinc-300" />
        </h2>
        <p className="text-xs text-zinc-400 text-center mb-6">
          Upload your custom picture and display name
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-col items-center mb-4">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-full bg-zinc-800 border-2 border-white/20 object-cover shadow-xl"
              />
              <div className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-6 h-6 mb-0.5" />
                <span className="text-[10px] font-bold uppercase">Upload</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const seed = Math.random().toString(36).substring(7);
                  setAvatarUrl(`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`);
                }}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-medium transition-all"
              >
                Random Avatar
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Your Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Type your name"
                className="w-full glass-input border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              About / Status
            </label>
            <input
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full glass-input border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 active:scale-[0.99] text-white border border-zinc-600/50 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50 mt-6"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save & Enter Chat-Ko</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
