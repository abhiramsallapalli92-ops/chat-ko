'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Chat-Ko Critical Error Catch]:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 bg-chat-bg flex flex-col items-center justify-center p-6 text-center select-none h-full w-full">
          <div className="w-16 h-16 glass-card border border-red-500/30 rounded-3xl flex items-center justify-center text-red-400 mb-4 shadow-xl">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Something went wrong opening this chat</h2>
          <p className="text-xs text-zinc-400 max-w-sm mb-4 leading-relaxed">
            {this.state.error?.message || 'An unexpected rendering exception occurred while loading this conversation.'}
          </p>

          <div className="flex items-center gap-3">
            {this.props.onReset && (
              <button
                onClick={this.handleReset}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/15 active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Chat List</span>
              </button>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload App</span>
            </button>
          </div>

          <div className="mt-4 p-3 bg-black/60 border border-white/10 rounded-xl text-[11px] font-mono text-zinc-400 max-w-md text-left overflow-x-auto">
            {this.state.error ? this.state.error.toString() : 'Unknown runtime error'}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
