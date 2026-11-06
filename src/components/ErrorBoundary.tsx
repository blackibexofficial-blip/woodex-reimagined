import { Component, type ErrorInfo, type ReactNode } from "react";
import { waLink, site } from "@/config/site";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * App-root error boundary. Catches render/lifecycle errors anywhere in the
 * tree and shows a branded fallback instead of a white screen — with a
 * recovery action and a WhatsApp escape hatch (WOODEX's primary channel).
 *
 * Wired in main.tsx around <App />. Errors are logged to console.error for
 * now; hook up Sentry here when the DSN is provisioned (see docs/08-master-plan).
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Central hook point for a future monitoring SDK (Sentry/LogRocket).
    console.error("[woodex] Uncaught render error:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-secondary flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center space-y-5 shadow-sm">
          <div className="text-5xl select-none" aria-hidden>
            🛋️
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-hon-green-dark">WOODEX</p>
            <h1 className="text-2xl font-black tracking-tight text-foreground mt-1">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              The page hit an unexpected error and could not render. Your cart is safe — it is stored
              locally in your browser.
            </p>
          </div>
          {this.state.error?.message && (
            <pre className="text-left text-[11px] leading-snug bg-muted text-muted-foreground rounded p-3 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Back to homepage
            </button>
            <a
              href={waLink("Hi WOODEX, the website showed an error and I need help.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-sm border border-input px-5 py-2.5 text-sm font-semibold text-foreground hover:border-accent hover:text-hon-green-dark transition-colors"
            >
              Chat on WhatsApp
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Or call us at <a className="underline" href={`tel:${site.whatsapp}`}>{site.phone}</a>
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
