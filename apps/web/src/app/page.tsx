'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/useAuthStore';
import { useChatStore } from '../store/useChatStore';
import { AuthFlow } from '../components/auth/AuthFlow';
import { ProfileSetupModal } from '../components/auth/ProfileSetupModal';
import { Sidebar } from '../components/chat/Sidebar';
import { ChatWindow } from '../components/chat/ChatWindow';
import { ChatErrorBoundary } from '../components/chat/ChatErrorBoundary';
import { SafetyCodeModal } from '../components/security/SafetyCodeModal';
import { SettingsModal } from '../components/settings/SettingsModal';
import { NotificationToast } from '../components/notifications/NotificationToast';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { initSoundUnlock } from '../lib/soundEffects';
import { Loader2, Lock, ShieldCheck, Sparkles } from 'lucide-react';

export default function Home() {
  const { isAuthenticated, loadSavedAuth, user } = useAuthStore();
  const { connectSocket, disconnectSocket, fetchConversations, activeConversationId, selectConversation, activeSafetyVerifyContact, setSafetyVerifyContact } = useChatStore();
  const viewportHeight = useVisualViewport();
  
  const [loading, setLoading] = useState(true);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    initSoundUnlock();

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    async function init() {
      const isAuth = await loadSavedAuth();
      setLoading(false);

      if (isAuth) {
        connectSocket();
        fetchConversations();

        // Restore chat from URL if present
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const chatParam = params.get('chat');
          if (chatParam) {
            selectConversation(chatParam, false);
          }
        }
      }
    }
    init();

    return () => {
      disconnectSocket();
    };
  }, [loadSavedAuth, connectSocket, disconnectSocket, fetchConversations, selectConversation]);

  // Trigger Profile Setup if user name is missing or default
  useEffect(() => {
    if (isAuthenticated && user && (!user.name || user.name.startsWith('User '))) {
      setShowProfileSetup(true);
    }
  }, [isAuthenticated, user]);

  // Handle Mobile System Back Button Navigation & History POP
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const chatId = params.get('chat');
      selectConversation(chatId || '', false);

      const modal = params.get('modal');
      if (!modal) {
        setShowSettings(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectConversation]);

  const handleBack = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('chat')) {
      window.history.back();
    } else {
      selectConversation('', false);
    }
  };

  const openSettings = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('modal', 'settings');
    window.history.pushState({ modal: 'settings' }, '', url.toString());
    setShowSettings(true);
  };

  const closeSettings = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('modal') === 'settings') {
      window.history.back();
    } else {
      setShowSettings(false);
    }
  };

  if (loading) {
    return (
      <div
        className="h-screen h-[100dvh] w-screen flex flex-col items-center justify-center text-white relative overflow-hidden"
        style={{ background: '#08080a' }}
      >
        {/* Background orbs for loading state */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-[100px]" style={{ background: 'radial-gradient(circle, rgba(180,180,200,0.4) 0%, transparent 70%)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-15 blur-[100px]" style={{ background: 'radial-gradient(circle, rgba(150,150,180,0.3) 0%, transparent 70%)' }} />
        </div>
        <Loader2 className="w-9 h-9 text-[#0A84FF] animate-spin mb-4 relative z-10" />
        <h1 className="text-xl font-bold tracking-tight relative z-10">Chat-Ko</h1>
        <p className="text-xs text-[#8E8E93] mt-1 relative z-10">Initializing Secure Enclave...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative overflow-hidden" style={{ background: '#0a0a0f' }}>
        {/* Pure CSS glassmorphism ambient — no background image */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 120% 80% at 20% 30%, rgba(10,132,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 100% 70% at 80% 70%, rgba(94,92,230,0.10) 0%, transparent 60%), linear-gradient(160deg, #0a0a0f 0%, #0d0d18 100%)' }} />
          {/* Ambient orbs */}
          <div className="glass-orb-float absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-[130px] opacity-30" style={{ background: 'radial-gradient(circle, rgba(10,132,255,0.35) 0%, transparent 70%)' }} />
          <div className="glass-orb-float-slow absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full blur-[120px] opacity-25" style={{ background: 'radial-gradient(circle, rgba(94,92,230,0.30) 0%, transparent 70%)' }} />
        </div>
        <AuthFlow
          onSuccess={() => {
            connectSocket();
            fetchConversations();
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '100vw',
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        background: '#0a0a0f',
      }}
    >
      {/* ─── Pure CSS Glassmorphism Ambient Background (no image) ─── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Deep dark base with subtle blue/purple tint */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 140% 90% at 15% 25%, rgba(10,132,255,0.10) 0%, transparent 55%), radial-gradient(ellipse 120% 80% at 85% 75%, rgba(94,92,230,0.08) 0%, transparent 55%), linear-gradient(160deg, #0a0a0f 0%, #0c0c16 50%, #0a0a0f 100%)' }} />
        {/* Ambient light orbs — animated slow drift */}
        <div className="glass-orb-float absolute top-[-5%] left-[-5%] w-[600px] h-[600px] rounded-full blur-[150px] opacity-25" style={{ background: 'radial-gradient(circle, rgba(10,132,255,0.30) 0%, transparent 70%)' }} />
        <div className="glass-orb-float-slow absolute bottom-[-5%] right-[-5%] w-[500px] h-[500px] rounded-full blur-[140px] opacity-20" style={{ background: 'radial-gradient(circle, rgba(94,92,230,0.28) 0%, transparent 70%)' }} />
        <div className="glass-orb-float absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[180px] opacity-10" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)' }} />
      </div>

      {/* ─── Mobile Layout (< 768px): full-bleed over the chrome background ─── */}
      {isMobile ? (
        <main
          style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
          className="relative w-full h-screen h-[100dvh] text-[#F2F2F7] flex overflow-hidden select-none z-10"
        >
          <div className="relative w-full h-full overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              {!activeConversationId ? (
                <motion.div
                  key="mobile-sidebar"
                  initial={{ x: '-20%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '-20%', opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                  className="w-full h-full absolute inset-0"
                >
                  <Sidebar onOpenSettings={openSettings} />
                </motion.div>
              ) : (
                <motion.div
                  key="mobile-chat"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                  className="w-full h-full absolute inset-0 z-20"
                >
                  <ChatErrorBoundary onReset={() => selectConversation('', false)}>
                    <ChatWindow onBack={handleBack} />
                  </ChatErrorBoundary>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Modals */}
          {showProfileSetup && (
            <ProfileSetupModal onComplete={() => setShowProfileSetup(false)} />
          )}
          {showSettings && (
            <SettingsModal onClose={closeSettings} />
          )}
          {activeSafetyVerifyContact && (
            <SafetyCodeModal
              contact={activeSafetyVerifyContact}
              onClose={() => setSafetyVerifyContact(null)}
            />
          )}
          <NotificationToast />
        </main>
      ) : (
        /* ─── Desktop Layout (≥ 768px): macOS glass window frame ─── */
        <main
          className="relative w-full h-screen h-[100dvh] text-[#F2F2F7] flex items-center justify-center overflow-hidden select-none z-10"
        >
          {/* macOS-style frosted glass floating window */}
          <div
            className="relative w-full max-w-7xl mx-auto flex flex-col overflow-hidden"
            style={{
              height: 'min(calc(100vh - 40px), 860px)',
              borderRadius: '14px',
              background: 'linear-gradient(145deg, rgba(28, 30, 38, 0.50) 0%, rgba(14, 15, 20, 0.68) 100%)',
              backdropFilter: 'blur(36px) saturate(220%) brightness(108%)',
              WebkitBackdropFilter: 'blur(36px) saturate(220%) brightness(108%)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: 'inset 0 1.5px 1px 0 rgba(255,255,255,0.25), inset 0 -1px 1px 0 rgba(255,255,255,0.05), 0 40px 80px -20px rgba(0,0,0,0.85), 0 0 0 0.5px rgba(255,255,255,0.06)',
            }}
          >
            {/* macOS-style title bar */}
            <div
              className="flex items-center px-4 flex-shrink-0"
              style={{
                height: '38px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
              }}
            >
              {/* Traffic light buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-3 h-3 rounded-full shadow-inner" style={{ background: '#FF5F56', boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(255,95,86,0.5)' }} />
                <div className="w-3 h-3 rounded-full shadow-inner" style={{ background: '#FFBD2E', boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(255,189,46,0.5)' }} />
                <div className="w-3 h-3 rounded-full shadow-inner" style={{ background: '#27C93F', boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(39,201,63,0.5)' }} />
              </div>
              {/* URL pill — centered */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)' }}>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] font-medium text-[#8E8E93] tracking-tight">chatko.web.app</span>
              </div>
            </div>

            {/* App content */}
            <div className="flex flex-1 overflow-hidden">
              <div className="w-80 lg:w-96 h-full flex-shrink-0 border-r border-white/[0.08]">
                <Sidebar onOpenSettings={openSettings} />
              </div>
              <div className="flex-1 h-full">
                <ChatErrorBoundary onReset={() => selectConversation('', false)}>
                  <ChatWindow onBack={handleBack} />
                </ChatErrorBoundary>
              </div>
            </div>
          </div>

          {/* Modals */}
          {showProfileSetup && (
            <ProfileSetupModal onComplete={() => setShowProfileSetup(false)} />
          )}
          {showSettings && (
            <SettingsModal onClose={closeSettings} />
          )}
          {activeSafetyVerifyContact && (
            <SafetyCodeModal
              contact={activeSafetyVerifyContact}
              onClose={() => setSafetyVerifyContact(null)}
            />
          )}
          <NotificationToast />
        </main>
      )}
    </div>
  );
}
