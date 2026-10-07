import { resolveCapabilityAvailability, resolveCapabilityConsequential, } from './capability.js';
/** Thrown when a capability is executed while its availability check reports it unavailable. */
export class CapabilityUnavailableError extends Error {
    name = 'CapabilityUnavailableError';
}
function createExecutionId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
function safeErrorName(error) {
    const name = error?.name;
    return typeof name === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(name) ? name : undefined;
}
function notify(instrumentation, event) {
    const { observer, onObserverError } = instrumentation;
    if (!observer) {
        return;
    }
    const report = (error) => {
        try {
            onObserverError?.(error, event);
        }
        catch {
            // Telemetry must never become operationally critical.
        }
    };
    try {
        const pending = observer.onEvent(event);
        if (pending) {
            Promise.resolve(pending).catch(report);
        }
    }
    catch (error) {
        report(error);
    }
}
/**
 * Run a capability with an availability check, a fresh execution ID, and optional lifecycle
 * observation. The capability's result or error is returned or rethrown unchanged.
 */
export async function executeCapability(capability, input, options = {}) {
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
            throw new CapabilityUnavailableError(availability.reason ?? `Capability "${capability.id}" is not currently available.`);
        }
        const result = await capability.execute(input, { signal, executionId });
        notify(options, {
            ...base,
            phase: 'succeeded',
            durationMs: performance.now() - start,
        });
        return result;
    }
    catch (error) {
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
//# sourceMappingURL=execution.js.map