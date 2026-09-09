import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chat-Ko — Ultra-Fast Real-Time Messenger',
  description: 'Production-grade Real-Time Cloud Messenger powered by Cloud Firestore',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chat-Ko',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b141a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full bg-chat-bg text-white antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
