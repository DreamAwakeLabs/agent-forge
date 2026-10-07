import type { Capability, CapabilityEffect } from './types.js';
export type CapabilityExecutionPhase = 'started' | 'succeeded' | 'failed' | 'aborted';
/**
 * The agent surface an execution arrived through. Documented values are 'webmcp', 'mcp', 'voice',
 * and 'embedded'; any other string is allowed so new adapters need no Agent Forge release.
 */
export type CapabilitySurface = 'webmcp' | 'mcp' | 'voice' | 'embedded' | (string & {});
/**
 * Metadata-only lifecycle event. It deliberately carries no input, output, error message, or other
 * free text. Correlate application-level detail yourself through `executionId`.
 */
export interface CapabilityExecutionEvent {
    capabilityId: string;
    effect: CapabilityEffect;
    consequential: boolean;
    phase: CapabilityExecutionPhase;
    /** Opaque random ID shared by every event of one execution. Not derived from input. */
    executionId: string;
    /** Epoch milliseconds when the execution started. */
    startedAt: number;
    /** Monotonic duration in milliseconds. Present on 'succeeded', 'failed', and 'aborted'. */
    durationMs?: number;
    /** The thrown error's class name (for example 'TypeError'), only when it is identifier-shaped. */
    errorName?: string;
    surface?: CapabilitySurface;
}
export interface CapabilityObserver {
    /** Called synchronously; a returned promise is not awaited. Failures never reach the capability. */
    onEvent(event: CapabilityExecutionEvent): void | Promise<void>;
}
export interface CapabilityInstrumentation {
    observer?: CapabilityObserver;
    surface?: CapabilitySurface;
    /** Receives errors thrown or rejected by the observer. They are ignored when omitted. */
    onObserverError?: (error: unknown, event: CapabilityExecutionEvent) => void;
}
export interface ExecuteCapabilityOptions extends CapabilityInstrumentation {
    /** Cancellation for this execution. Defaults to a signal that never aborts. */
    signal?: AbortSignal;
}
/** Thrown when a capability is executed while its availability check reports it unavailable. */
export declare class CapabilityUnavailableError extends Error {
    readonly name = "CapabilityUnavailableError";
}
/**
 * Run a capability with an availability check, a fresh execution ID, and optional lifecycle
 * observation. The capability's result or error is returned or rethrown unchanged.
 */
export declare function executeCapability<TInput, TResult>(capability: Capability<TInput, TResult>, input: TInput, options?: ExecuteCapabilityOptions): Promise<TResult>;
//# sourceMappingURL=execution.d.ts.map