import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  pullingText?: string;
  refreshingText?: string;
  className?: string;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  pullingText,
  refreshingText,
  className = '',
}) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPullingRef = useRef(false);

  const THRESHOLD = 56;
  const MAX_PULL = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isRefreshing) return;
    const container = containerRef.current;
    if (container && container.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      isPullingRef.current = true;
    } else {
      startYRef.current = null;
      isPullingRef.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPullingRef.current || startYRef.current === null || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    const container = containerRef.current;
    if (container && container.scrollTop > 0) {
      isPullingRef.current = false;
      setPullDistance(0);
      return;
    }

    if (diff > 0) {
      // iOS rubber-band resistance curve
      const resistance = Math.min(diff * 0.42, MAX_PULL);
      setPullDistance(resistance);
      if (e.cancelable && diff > 10) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!isPullingRef.current || isRefreshing) return;
    isPullingRef.current = false;
    startYRef.current = null;

    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(THRESHOLD);

      try {
        await onRefresh();
      } catch (err) {
        console.error('Pull to refresh notice:', err);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 350);
      }
    } else {
      setPullDistance(0);
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`relative overflow-y-auto overscroll-y-contain ${className}`}
    >
      {/* iOS Glassmorphic Pull Indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div
          style={{
            transform: `translateY(${pullDistance - 48}px)`,
            opacity: Math.min(pullDistance / 35, 1),
          }}
          className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none transition-transform duration-100 ease-out"
        >
          <div className="glass-surface px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg border border-white/10">
            <Loader2
              className={`w-4 h-4 text-[#0A84FF] ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                transform: !isRefreshing ? `rotate(${(pullDistance / THRESHOLD) * 280}deg)` : undefined,
              }}
            />
            <span className="text-[11px] font-medium text-[#8E8E93]">
              {isRefreshing ? (refreshingText || 'Updating...') : (pullingText || 'Pull to refresh')}
            </span>
          </div>
        </div>
      )}

      {/* Content wrapper with elastic push */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : undefined,
          transition: isPullingRef.current ? 'none' : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};
