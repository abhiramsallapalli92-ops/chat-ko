import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, Phone, ArrowRight, RefreshCw, KeyRound, Info, MessageCircle, Lock, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { auth } from '../../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

interface PhoneAuthFlowProps {
  onSuccess: () => void;
}

export const PhoneAuthFlow: React.FC<PhoneAuthFlowProps> = ({ onSuccess }) => {
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<any | null>(null);

  const isDevMode = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_TEST_OTP === 'true';

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { setAuth } = useAuthStore();

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const rawDigits = phoneNumber.replace(/\D/g, '');
  const fullPhoneNumber = `${countryCode}${rawDigits}`;

  const setupRecaptcha = () => {
    if (typeof window !== 'undefined') {
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {}
      }
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {},
        'expired-callback': () => {
          setError('reCAPTCHA verification expired. Please try resending the code.');
        },
      });
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rawDigits || rawDigits.length < 6) {
      setError('Please enter a valid mobile phone number');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;

      const result = await signInWithPhoneNumber(auth, fullPhoneNumber, appVerifier);
      setConfirmationResult(result);
      setStep('OTP');
      setCooldown(60);
    } catch (err: any) {
      console.warn('Firebase SMS error or test PIN mode active:', err);
      if (err?.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format. Please check your number.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('SMS limit reached. Please try again later.');
      } else if (err?.code === 'auth/billing-not-enabled' || err?.message?.includes('billing')) {
        setError('SMS delivery unavailable. Please try again or use a different sign-in method.');
      } else {
        setError(err.message || 'Could not send SMS. Please try again.');
      }
      setStep('OTP');
      setCooldown(60);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const char = value.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);

    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      handleVerifyOtp(newDigits.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (codeStr?: string) => {
    const code = codeStr || otpDigits.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      let uid = `user_${fullPhoneNumber.replace(/\D/g, '')}`;

      if (confirmationResult && !(isDevMode && code === '123456')) {
        const userCredential = await confirmationResult.confirm(code);
        uid = userCredential.user.uid;
      } else if (!(isDevMode && code === '123456') && !confirmationResult) {
        throw new Error('SMS session expired or unavailable. Please click Resend Code to get a new code.');
      }

      const mockToken = `firebase_jwt_token_${uid}_${Date.now()}`;
      const userProfile = {
        id: uid,
        phoneNumber: fullPhoneNumber,
        name: `User ${fullPhoneNumber.slice(-4)}`,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${fullPhoneNumber}`,
        bio: 'Hey there! I am using Chat-Ko.',
        status: 'ONLINE' as const,
        createdAt: new Date().toISOString(),
      };

      await setAuth(mockToken, userProfile);
      onSuccess();
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.message || 'Verification failed. Please check the 6-digit code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-chat-bg text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div id="recaptcha-container"></div>

      {/* Dynamic Background Light Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-400/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl z-10 border border-white/10 relative overflow-hidden">
        {/* Glow Header Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-600" />

        <div className="flex flex-col items-center mb-6 pt-2">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-600 via-emerald-500 to-emerald-400 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg shadow-emerald-500/30">
            <MessageCircle className="w-9 h-9 fill-white/20 stroke-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
            <span>Chat-Ko</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </h1>
          <p className="text-xs text-emerald-400 font-semibold tracking-wide uppercase mt-1">
            End-to-End Encrypted Messenger
          </p>
        </div>

        {/* Informational SMS / Dev Code Note */}
        {isDevMode && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-300 text-xs leading-relaxed flex items-start gap-3 shadow-inner">
            <Info className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block text-emerald-300 font-semibold mb-1">Dev Mode — Test OTP Active:</strong>
              Use test PIN <strong className="text-white font-mono bg-emerald-500/30 px-2 py-0.5 rounded border border-emerald-500/40">123456</strong> for instant login testing.
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs text-center font-medium">
            {error}
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleSendOtp} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-chat-muted uppercase tracking-wider mb-2">
                Mobile Phone Number
              </label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-chat-input border border-chat-border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white font-medium shadow-inner"
                >
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+49">🇩🇪 +49</option>
                  <option value="+81">🇯🇵 +81</option>
                  <option value="+61">🇦🇺 +61</option>
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+966">🇸🇦 +966</option>
                </select>
                <div className="relative flex-1">
                  <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-chat-muted" />
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-chat-input border border-chat-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-emerald-500 text-white shadow-inner font-medium"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-chat-muted">
                Enter the 6-digit code sent to{' '}
                <span className="font-semibold text-white">{fullPhoneNumber}</span>
              </p>
              <button
                onClick={() => setStep('PHONE')}
                className="text-xs text-emerald-400 hover:underline mt-1 inline-block font-medium"
              >
                Change Phone Number
              </button>
            </div>

            {isDevMode && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span>Test Code: <strong className="text-white font-mono bg-emerald-500/30 px-1.5 py-0.5 rounded border border-emerald-500/40">123456</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const digits = '123456'.split('');
                    setOtpDigits(digits);
                    handleVerifyOtp('123456');
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-colors"
                >
                  Auto-fill &amp; Login
                </button>
              </div>
            )}

            <div className="flex justify-between gap-2">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { otpInputRefs.current[idx] = el; }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className="w-12 h-14 bg-chat-input border border-chat-border text-center text-xl font-bold rounded-xl focus:outline-none focus:border-emerald-500 text-white shadow-inner"
                />
              ))}
            </div>

            <button
              onClick={() => handleVerifyOtp()}
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <span>Verify & Enter Chat-Ko</span>
              )}
            </button>

            <div className="text-center pt-2">
              <button
                onClick={handleSendOtp}
                disabled={cooldown > 0 || loading}
                className="text-xs text-chat-muted hover:text-white transition-colors disabled:opacity-50"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't receive code? Resend"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

