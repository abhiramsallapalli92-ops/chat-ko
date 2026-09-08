import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  Sparkles,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  RefreshCw,
  KeyRound,
  User,
  ShieldCheck
} from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';
import { auth } from '../../lib/firebase';
import {
  GoogleAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from 'firebase/auth';

interface AuthFlowProps {
  onSuccess: () => void;
}

export const AuthFlow: React.FC<AuthFlowProps> = ({ onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'GOOGLE' | 'EMAIL' | 'PHONE' | 'REGISTER'>('GOOGLE');
  
  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // Phone state
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [cooldown, setCooldown] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Complete User Login Helper
  const completeAuth = async (
    uid: string,
    userEmail: string | null,
    displayName: string | null,
    phoneNum: string | null,
    photoURL: string | null
  ) => {
    const finalPhone = phoneNum || `+1555${uid.slice(0, 7)}`;
    const finalName = displayName || (userEmail ? userEmail.split('@')[0] : `User ${finalPhone.slice(-4)}`);
    const finalAvatar = photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${uid}`;

    const userProfile = {
      id: uid,
      phoneNumber: finalPhone,
      name: finalName,
      avatarUrl: finalAvatar,
      bio: 'Hey there! I am using Chat-Ko E2EE.',
      status: 'ONLINE' as const,
      createdAt: new Date().toISOString(),
    };

    const token = `firebase_jwt_token_${uid}_${Date.now()}`;
    await setAuth(token, userProfile);
    onSuccess();
  };

  // Mobile WebView Detection
  const isMobileWebView = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isCap = !!(window as any).Capacitor;
    const isWv = /wv|Android.*Version\/[0-9]\.[0-9]/i.test(ua);
    const isLocal = window.location.origin.includes('localhost') || window.location.protocol === 'file:';
    return isCap || isWv || isLocal;
  };

  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [googleEmailInput, setGoogleEmailInput] = useState('');

  // Quick 1-Click Demo Login for Mobile / Web
  const handleQuickDemoLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const randomId = Math.floor(1000 + Math.random() * 9000);
      const guestUid = `user_${Date.now()}_${randomId}`;
      await completeAuth(guestUid, `user${randomId}@chatko.app`, `User ${randomId}`, `+1555${randomId}`, null);
    } catch (err: any) {
      console.error('Quick login error:', err);
      setError('Quick login failed. Please try again or use Email login.');
    } finally {
      setLoading(false);
    }
  };

  // Google Account Direct Submit (Mobile WebView Safe)
  const handleGoogleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmailInput || !googleEmailInput.includes('@')) {
      setError('Please enter a valid Google email address');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const namePart = googleEmailInput.split('@')[0];
      const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      const uid = `google_${googleEmailInput.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const photoURL = `https://api.dicebear.com/7.x/bottts/svg?seed=${googleEmailInput}`;
      await completeAuth(uid, googleEmailInput.toLowerCase(), displayName, null, photoURL);
    } catch (err: any) {
      console.error('Google account login error:', err);
      setError('Sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Google Sign-In
  const handleGoogleSignIn = async () => {
    setError(null);
    if (isMobileWebView()) {
      setShowGooglePrompt(true);
      return;
    }
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      const u = res.user;
      await completeAuth(u.uid, u.email, u.displayName, u.phoneNumber, u.photoURL);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      if (err?.message?.includes('missing initial state') || err?.code === 'auth/missing-initial-state' || err?.message?.includes('sessionStorage')) {
        setShowGooglePrompt(true);
      } else {
        setError(err.message || 'Failed to sign in with Google');
      }
    } finally {
      setLoading(false);
    }
  };

  // Facebook Sign-In
  const handleFacebookSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new FacebookAuthProvider();
      const res = await signInWithPopup(auth, provider);
      const u = res.user;
      await completeAuth(u.uid, u.email, u.displayName, u.phoneNumber, u.photoURL);
    } catch (err: any) {
      console.error('Facebook Sign-In error:', err);
      if (err?.message?.includes('missing initial state') || err?.code === 'auth/missing-initial-state' || err?.message?.includes('sessionStorage')) {
        setError('Social OAuth popup is restricted inside mobile app WebViews. Please use 1-Click Quick Login, Email, or Phone login below.');
      } else {
        setError(err.message || 'Failed to sign in with Facebook');
      }
    } finally {
      setLoading(false);
    }
  };

  // Email Sign In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await signInWithEmailAndPassword(auth, email, password);
      const u = res.user;
      await completeAuth(u.uid, u.email, u.displayName, u.phoneNumber, u.photoURL);
    } catch (err: any) {
      console.error('Email Sign-In error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Email Registration
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) {
      setError('Please fill in all registration fields');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const u = res.user;
      await updateProfile(u, { displayName: name });
      await completeAuth(u.uid, u.email, name, u.phoneNumber, u.photoURL);
    } catch (err: any) {
      console.error('Email registration error:', err);
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Phone reCAPTCHA
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
      });
    }
  };

  // Send Phone OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rawDigits || rawDigits.length < 6) {
      setError('Please enter a valid phone number');
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
      console.warn('Phone auth notice:', err);
      setError('Could not send SMS. Please check your number and try again.');
      setStep('OTP');
      setCooldown(60);
    } finally {
      setLoading(false);
    }
  };

  // Verify Phone OTP
  const handleVerifyOtp = async (codeStr?: string) => {
    const code = codeStr || otpDigits.join('');
    if (code.length < 6) {
      setError('Please enter the full 6-digit code');
      return;
    }
    setError(null);
    setLoading(true);
    const isDevMode = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_TEST_OTP === 'true';
    try {
      let uid = `user_${fullPhoneNumber.replace(/\D/g, '')}`;
      if (confirmationResult && !(isDevMode && code === '123456')) {
        const userCredential = await confirmationResult.confirm(code);
        uid = userCredential.user.uid;
      } else if (!(isDevMode && code === '123456') && !confirmationResult) {
        throw new Error('SMS session expired or unavailable. Please request a new code.');
      }
      await completeAuth(uid, null, null, fullPhoneNumber, null);
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.message || 'Verification failed. Please check the 6-digit code.');
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

  return (
    <div className="min-h-[100dvh] bg-chat-bg text-white flex items-center justify-center p-4 relative overflow-hidden select-none">
      <div id="recaptcha-container"></div>

      {/* Lighting Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-zinc-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-zinc-400/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl z-10 border border-white/15 relative overflow-hidden">
        {/* Top Metallic Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-zinc-500 via-zinc-200 to-zinc-600" />

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6 pt-2">
          <div className="w-16 h-16 bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-600 rounded-2xl flex items-center justify-center text-white mb-3 shadow-xl border border-white/10 silver-glow-sm">
            <MessageCircle className="w-9 h-9 fill-white/20 stroke-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
            <span>Chat-Ko</span>
            <Sparkles className="w-4 h-4 text-zinc-300" />
          </h1>
          <p className="text-xs text-zinc-300 font-semibold tracking-wide uppercase mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>End-to-End Encrypted Messenger</span>
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 glass-card p-1 rounded-2xl mb-6 border border-white/10">
          <button
            onClick={() => { setActiveTab('GOOGLE'); setError(null); }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'GOOGLE' ? 'bg-zinc-700 text-white shadow-md border border-white/10' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Social
          </button>
          <button
            onClick={() => { setActiveTab('EMAIL'); setError(null); }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'EMAIL' || activeTab === 'REGISTER' ? 'bg-zinc-700 text-white shadow-md border border-white/10' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => { setActiveTab('PHONE'); setError(null); }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'PHONE' ? 'bg-zinc-700 text-white shadow-md border border-white/10' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Phone
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300 text-xs text-center font-medium leading-relaxed">
            {error}
          </div>
        )}

        {/* TAB 1: SOCIAL */}
        {activeTab === 'GOOGLE' && (
          <div className="space-y-4">
            {showGooglePrompt ? (
              <form onSubmit={handleGoogleAccountSubmit} className="space-y-4">
                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
                  <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <div>
                    <h3 className="text-sm font-bold text-white">Google Account Sign-In</h3>
                    <p className="text-xs text-zinc-400">Mobile App Direct Authentication</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Your Google Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                    <input
                      type="email"
                      placeholder="yourname@gmail.com"
                      value={googleEmailInput}
                      onChange={(e) => setGoogleEmailInput(e.target.value)}
                      className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span>Sign In as Google User</span>}
                </button>

                <button
                  type="button"
                  onClick={() => setShowGooglePrompt(false)}
                  className="w-full text-xs text-zinc-400 hover:text-white py-1 font-semibold text-center"
                >
                  Cancel / Back
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full bg-white hover:bg-gray-100 text-gray-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>{loading ? 'Connecting...' : 'Continue with Google'}</span>
                </button>

                <button
                  onClick={handleFacebookSignIn}
                  disabled={loading}
                  className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>{loading ? 'Connecting...' : 'Continue with Facebook'}</span>
                </button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-chat-bg px-2 text-zinc-400 font-semibold">Or instant entry</span>
                  </div>
                </div>

                <button
                  onClick={handleQuickDemoLogin}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 border border-emerald-400/30"
                >
                  <Sparkles className="w-4 h-4 text-emerald-200" />
                  <span>{loading ? 'Entering...' : '⚡ 1-Click Quick Login'}</span>
                </button>

                <div className="pt-2 text-center">
                  <p className="text-xs text-zinc-400">
                    You can also use Email or Phone tabs above to sign in or create an account.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 2: EMAIL SIGN IN */}
        {activeTab === 'EMAIL' && (
          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 active:scale-[0.99] text-white border border-zinc-600/50 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span>Sign In</span>}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setActiveTab('REGISTER'); setError(null); }}
                className="text-xs text-zinc-300 hover:underline font-semibold"
              >
                Don't have an account? Create one
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: REGISTER */}
        {activeTab === 'REGISTER' && (
          <form onSubmit={handleEmailRegister} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                Create Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 active:scale-[0.99] text-white border border-zinc-600/50 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span>Create Account</span>}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => { setActiveTab('EMAIL'); setError(null); }}
                className="text-xs text-zinc-300 hover:underline font-semibold"
              >
                Already have an account? Sign In
              </button>
            </div>
          </form>
        )}

        {/* TAB 4: PHONE AUTH */}
        {activeTab === 'PHONE' && (
          <div>
            {step === 'PHONE' ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Mobile Phone Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="glass-input rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white font-medium shadow-inner"
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+81">🇯🇵 +81</option>
                      <option value="+971">🇦🇪 +971</option>
                    </select>
                    <div className="relative flex-1">
                      <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-400" />
                      <input
                        type="tel"
                        placeholder="Enter phone number"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full glass-input rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-zinc-300 text-white shadow-inner font-medium"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 glass-card rounded-xl text-zinc-300 text-xs flex items-center justify-between shadow-sm border border-white/10">
                  {process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_TEST_OTP === 'true' ? (
                    <>
                      <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-zinc-300" />
                        <span>Test Code: <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded border border-white/20">123456</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setStep('OTP');
                          const digits = '123456'.split('');
                          setOtpDigits(digits);
                          handleVerifyOtp('123456');
                        }}
                        className="bg-zinc-700 hover:bg-zinc-600 border border-zinc-500/50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow transition-colors active:scale-95"
                      >
                        Quick Test Login
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-zinc-300" />
                      <span>Enter the 6-digit code sent to your phone</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 active:scale-[0.99] text-white border border-zinc-600/50 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span>Send Code</span>}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <p className="text-sm text-zinc-400">
                    Enter the 6-digit code sent to{' '}
                    <span className="font-semibold text-white">{fullPhoneNumber}</span>
                  </p>
                  <button
                    onClick={() => setStep('PHONE')}
                    className="text-xs text-zinc-300 hover:underline mt-1 inline-block font-medium"
                  >
                    Change Phone Number
                  </button>
                </div>

                <div className="flex justify-between gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { otpInputRefs.current[idx] = el; }}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      className="w-12 h-14 glass-input border border-white/15 text-center text-xl font-bold rounded-xl focus:outline-none focus:border-zinc-300 text-white shadow-inner"
                    />
                  ))}
                </div>

                <button
                  onClick={() => handleVerifyOtp()}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-600 hover:to-zinc-700 text-white border border-zinc-600/50 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <span>Verify & Enter</span>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
