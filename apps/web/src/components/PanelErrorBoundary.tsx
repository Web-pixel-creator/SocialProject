'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PanelErrorBoundaryProps {
  children: ReactNode;
  description: string;
  retryLabel: string;
  title: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
}

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Render fallback UI; app-level reporting is handled by Next error boundary.
  }

  private readonly handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="card p-5" role="alert">
        <h3 className="font-semibold text-foreground text-lg">
          {this.props.title}
        </h3>
        <p className="mt-2 text-muted-foreground text-sm">
          {this.props.description}
        </p>
        <button
          className="mt-4 rounded-full border border-border/35 bg-muted/65 px-4 py-2 font-semibold text-foreground text-xs transition hover:border-border/55 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={this.handleRetry}
          type="button"
        >
          {this.props.retryLabel}
        </button>
      </section>
    );
  }
}
