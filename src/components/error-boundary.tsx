"use client";

import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] px-4 text-center">
          <div className="text-5xl mb-4">😵</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">页面出了点问题</h2>
          <p className="text-gray-500 mb-6 max-w-md">
            别担心，这通常是临时问题。点击重试试试看。
          </p>
          <div className="flex gap-3">
            <Button onClick={this.handleRetry}>重试</Button>
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              回到首页
            </Button>
          </div>
          {this.state.error && (
            <button
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="mt-6 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              {this.state.showDetails ? "隐藏详情" : "查看错误详情"}
            </button>
          )}
          {this.state.showDetails && this.state.error && (
            <pre className="mt-3 p-3 bg-gray-50 border rounded text-xs text-left text-red-600 max-w-lg overflow-auto max-h-48">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
