import {
  resolveCapabilityAvailability,
  resolveCapabilityConsequential,
} from './capability.js';
import type { Capability, CapabilityEffect } from './types.js';

export type CapabilityExecutionPhase =
  | 'started'
  | 'succeeded'
  | 'failed'
  | 'aborted';

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
export class CapabilityUnavailableError extends Error {
  override readonly name = 'CapabilityUnavailableError';
}

function createExecutionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeErrorName(error: unknown): string | undefined {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(name) ? name : undefined;
}

function notify(
  instrumentation: CapabilityInstrumentation,
  event: CapabilityExecutionEvent,
): void {
  const { observer, onObserverError } = instrumentation;
  if (!observer) {
    return;
  }
  const report = (error: unknown) => {
    try {
      onObserverError?.(error, event);
    } catch {
      // Telemetry must never become operationally critical.
    }
  };
  try {
    const pending = observer.onEvent(event);
    if (pending) {
      Promise.resolve(pending).catch(report);
    }
  } catch (error) {
    report(error);
  }
}

/**
 * Run a capability with an availability check, a fresh execution ID, and optional lifecycle
 * observation. The capability's result or error is returned or rethrown unchanged.
 */
export async function executeCapability<TInput, TResult>(
  capability: Capability<TInput, TResult>,
  input: TInput,
  options: ExecuteCapabilityOptions = {},
): Promise<TResult> {
  const signal = options.signal ?? new AbortController().signal;
  const executionId = createExecutionId();
  const startedAt = Date.now();
  const start = performance.now();
  const base = {
    capabilityId: capability.id,
    effect: capability.effect,
    consequential: resolveCapabilityConsequential(capability),
    executionId,
    startedAt,
    ...(options.surface ? { surface: options.surface } : {}),
  };

  notify(options, { ...base, phase: 'started' });
  try {
    const availability = resolveCapabilityAvailability(capability);
    if (!availability.available) {
      throw new CapabilityUnavailableError(
        availability.reason ?? `Capability "${capability.id}" is not currently available.`,
      );
    }
    const result = await capability.execute(input, { signal, executionId });
    notify(options, {
      ...base,
      phase: 'succeeded',
      durationMs: performance.now() - start,
    });
    return result;
  } catch (error) {
    const errorName = safeErrorName(error);
    notify(options, {
      ...base,
      phase: signal.aborted ? 'aborted' : 'failed',
      durationMs: performance.now() - start,
      ...(errorName ? { errorName } : {}),
    });
    throw error;
  }
}
