import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorScreen } from "./ErrorScreen";
import { reportUnexpected } from "./reporting";

interface ErrorBoundaryProps {
  scope: "app" | "page";
  children: ReactNode;
  /** When this changes the boundary clears, so leaving a broken page for another shows the other. */
  resetKey?: string;
  /** Reload the window; replaced in tests. */
  onReload?: () => void;
}

interface ErrorBoundaryState {
  failed: boolean;
  reportId: string | null;
  /** The reset key the state was made under: when it changes the boundary clears. */
  resetKey: string | undefined;
}

/**
 * Reports a render error once, with React's component stack, and shows the error
 * screen in place of what broke (REPORT-06, DEC-126). One wraps the whole app; one
 * wraps each destination's page, so the sidebar and the player bar keep working.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false, reportId: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { failed: false, reportId: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const reportId = reportUnexpected(error, {
      componentStack: info.componentStack ?? undefined,
      tags: { "boundary.scope": this.props.scope },
    });
    this.setState({ reportId });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorScreen
        scope={this.props.scope}
        reportId={this.state.reportId}
        onReload={this.props.onReload ?? (() => window.location.reload())}
      />
    );
  }
}
