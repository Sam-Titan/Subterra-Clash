import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorBlock } from "@/components/QueryState";

interface Props {
	children: ReactNode;
	title?: string;
	/** Changing this value clears a caught error (e.g. the route path). */
	resetKey?: unknown;
	/** Wrapper classes for the fallback. */
	className?: string;
}

interface State {
	error: Error | null;
}

/**
 * Catches render errors (e.g. a lost WebGL context in the 3D view) and shows
 * the shared error block with a retry instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidUpdate(prev: Props) {
		if (this.state.error && prev.resetKey !== this.props.resetKey) {
			this.setState({ error: null });
		}
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error(error, info.componentStack);
	}

	render() {
		if (!this.state.error) return this.props.children;
		return (
			<div className={this.props.className ?? "p-6"}>
				<ErrorBlock
					title={this.props.title ?? "Something went wrong on this page"}
					error={this.state.error}
					onRetry={() => this.setState({ error: null })}
				/>
			</div>
		);
	}
}
