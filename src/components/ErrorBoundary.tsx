import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h1 style={{ color: '#c62828' }}>😵 出了点问题</h1>
          <p style={{ color: '#666', marginBottom: 16 }}>
            应用遇到了一个意外错误，请尝试刷新页面。
          </p>
          <pre style={{
            background: '#f5f5f5', padding: 16, borderRadius: 8,
            maxWidth: 600, margin: '0 auto', textAlign: 'left',
            fontSize: 12, overflow: 'auto', maxHeight: 200,
          }}>
            {this.state.error?.message || '未知错误'}
          </pre>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 24px', fontSize: 14, cursor: 'pointer',
                borderRadius: 6, border: '1px solid #ccc', background: '#fff',
              }}
            >
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 24px', fontSize: 14, cursor: 'pointer',
                borderRadius: 6, border: 'none', background: '#2563eb', color: '#fff',
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
