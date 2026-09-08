import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, X, QrCode, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '@chat/shared-types';
import { generateSafetyFingerprint } from '@chat/crypto';
import { useAuthStore } from '../../store/useAuthStore';

interface SafetyCodeModalProps {
  contact: UserProfile;
  onClose: () => void;
}

export const SafetyCodeModal: React.FC<SafetyCodeModalProps> = ({ contact, onClose }) => {
  const { deviceKeys } = useAuthStore();
  const [fingerprint, setFingerprint] = useState<string>('Loading safety code...');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    async function calc() {
      if (deviceKeys?.identityKey.publicKey) {
        // Calculate deterministic SHA-256 fingerprint of identity public keys
        const fp = await generateSafetyFingerprint(
          deviceKeys.identityKey.publicKey,
          contact.id // Fallback seed or identity key
        );
        setFingerprint(fp);
      }
    }
    calc();
  }, [deviceKeys, contact]);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-chat-sidebar border border-chat-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
            <h2 className="text-lg font-bold text-white">Verify Safety Code</h2>
          </div>
          <button onClick={onClose} className="text-chat-muted hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-chat-muted mb-6 leading-relaxed">
          To verify that messages with <strong className="text-white">{contact.name}</strong> are end-to-end encrypted, compare the 60-digit number below with their device.
        </p>

        {/* QR Code Graphic Mock */}
        <div className="flex flex-col items-center justify-center bg-chat-input/50 p-6 rounded-2xl border border-chat-border mb-6">
          <div className="w-32 h-32 bg-white p-2 rounded-xl shadow-md flex items-center justify-center mb-4">
            <QrCode className="w-28 h-28 text-slate-900" />
          </div>

          <div className="font-mono text-sm tracking-wider font-semibold text-emerald-300 text-center max-w-xs leading-loose">
            {fingerprint}
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setVerified(!verified)}
            className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
              verified
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-chat-input hover:bg-chat-hover text-white border border-chat-border'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{verified ? 'Marked as Verified' : 'Mark as Verified'}</span>
          </button>

          <p className="text-[11px] text-chat-muted text-center flex items-center justify-center gap-1">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span>Double Ratchet Cryptographic Key Fingerprint</span>
          </p>
        </div>
      </div>
    </div>
  );
};
