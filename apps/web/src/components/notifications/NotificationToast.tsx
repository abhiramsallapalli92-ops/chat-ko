import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, ShieldCheck } from 'lucide-react';
import { useChatStore } from '../../store/useChatStore';

export interface NotificationItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  messageText: string;
}

export const NotificationToast: React.FC = () => {
  const { conversations, messages } = useChatStore();
  const processedIdsRef = useRef<Set<string>>(new Set<string>());
  const isInitialLoadRef = useRef<boolean>(true);

  useEffect(() => {
    // Request Browser / System Notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Listen to incoming messages and trigger native system device notification
  useEffect(() => {
    // Populate processedIds on initial load without firing notifications for history
    if (isInitialLoadRef.current) {
      Object.values(messages).forEach((msgList) => {
        msgList.forEach((msg) => processedIdsRef.current.add(msg.id));
      });
      if (Object.keys(messages).length > 0) {
        isInitialLoadRef.current = false;
      }
      return;
    }

    Object.entries(messages).forEach(([convId, msgList]) => {
      if (msgList.length > 0) {
        const lastMsg = msgList[msgList.length - 1];
        if (!processedIdsRef.current.has(lastMsg.id)) {
          processedIdsRef.current.add(lastMsg.id);
          
          // Check if message is incoming and unread
          const conv = conversations.find((c) => c.id === convId);
          if (conv) {
            const sender = conv.participants.find((p) => p && p.id === lastMsg.senderId);
            if (sender && lastMsg.status !== 'READ') {
              // Trigger native device system notification in notification tray
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                  const notificationText = lastMsg.messageType === 'IMAGE' 
                    ? '📷 Photo' 
                    : lastMsg.messageType === 'VIDEO_NOTE' 
                    ? '🎥 Video Note' 
                    : lastMsg.decryptedText || 'New Message';

                  new Notification(`Chat-Ko: ${sender.name}`, {
                    body: notificationText,
                    icon: sender.avatarUrl || '/icons/icon-192x192.png',
                  });
                } catch (e) {
                  console.warn('Native notification notice:', e);
                }
              }
            }
          }
        }
      }
    });
  }, [messages, conversations]);

  return null; // Return null so NO floating inline reply popup is rendered on screen!
};
