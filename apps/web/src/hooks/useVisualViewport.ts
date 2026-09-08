import { useEffect, useState } from 'react';

export function useVisualViewport() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    // Add CSS transition to the html element so that --visual-viewport-height
    // consumers (which set height via inline style from JS) animate smoothly
    // when the mobile keyboard opens / closes — just like WhatsApp / iMessage.
    document.documentElement.style.setProperty(
      '--vvp-transition',
      'height 0.25s cubic-bezier(0.32, 0.72, 0, 1)'
    );

    const handleResize = () => {
      if (!window.visualViewport) return;
      const height = window.visualViewport.height;
      setViewportHeight(height);
      document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
    };

    window.visualViewport.addEventListener('resize', handleResize);
    window.visualViewport.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return viewportHeight;
}
