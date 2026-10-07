import { resolveCapabilityAvailability, resolveCapabilityConsequential, } from './capability.js';
import { executeCapability } from './execution.js';
function browserModelContext() {
    if (typeof document === 'undefined') {
        return null;
    }
    return document.modelContext ?? null;
}
export function isWebMcpSupported(modelContext = browserModelContext()) {
    return Boolean(modelContext?.registerTool);
}
function toolFingerprint(capability) {
    return JSON.stringify({
        id: capability.id,
        title: capability.title,
        description: capability.description,
        inputSchema: capability.inputSchema,
        effect: capability.effect,
        untrustedContent: capability.untrustedContent ?? false,
        consequential: resolveCapabilityConsequential(capability),
    });
}
function serializeResult(result, capabilityId) {
    if (typeof result === 'string') {
        return result;
    }
    if (result === undefined) {
        return JSON.stringify({ ok: true, capability: capabilityId });
    }
    return JSON.stringify(result);
}
export class WebMcpAdapter {
    modelContext;
    exposedTo;
    instrumentation;
    registrations = new Map();
    /** Tail of the sync queue; syncs run one at a time in call order, so the last call wins. */
    queue = Promise.resolve();
    /** Incremented by dispose() so syncs queued or running before it stop registering tools. */
    generation = 0;
    constructor(options = {}) {
        this.modelContext = options.modelContext === undefined
            ? browserModelContext()
            : options.modelContext;
        this.exposedTo = options.exposedTo;
        this.instrumentation = {
            observer: options.observer,
            onObserverError: options.onObserverError,
            surface: 'webmcp',
        };
    }
    get supported() {
        return isWebMcpSupported(this.modelContext);
    }
    get registeredToolNames() {
        return [...this.registrations.keys()].sort();
    }
    sync(capabilities) {
        const generation = this.generation;
        const run = this.queue.then(() => this.reconcile(capabilities, generation));
        this.queue = run.catch(() => undefined);
        return run;
    }
    async reconcile(capabilities, generation) {
        const unavailable = [];
        const desired = new Map();
        for (const capability of capabilities) {
            const availability = resolveCapabilityAvailability(capability);
            if (availability.available) {
                desired.set(capability.id, capability);
            }
            else {
                unavailable.push({ id: capability.id, reason: availability.reason });
            }
        }
        for (const [id, registration] of this.registrations) {
            const capability = desired.get(id);
            if (!capability || registration.fingerprint !== toolFingerprint(capability)) {
                registration.controller.abort();
                this.registrations.delete(id);
            }
        }
        if (!this.modelContext) {
            return { supported: false, registered: [], unavailable };
        }
        for (const capability of desired.values()) {
            if (generation !== this.generation) {
                break;
            }
            if (this.registrations.has(capability.id)) {
                continue;
            }
            const controller = new AbortController();
            const tool = {
                name: capability.id,
                ...(capability.title ? { title: capability.title } : {}),
                description: capability.description,
                inputSchema: capability.inputSchema,
                annotations: {
                    readOnlyHint: capability.effect === 'read',
                    untrustedContentHint: capability.untrustedContent ?? false,
                    consequentialHint: resolveCapabilityConsequential(capability),
                },
                execute: async (input, options) => {
                    const result = await executeCapability(capability, input, {
                        ...this.instrumentation,
                        signal: options?.signal,
                    });
                    return serializeResult(result, capability.id);
                },
            };
            const registerOptions = {
                signal: controller.signal,
                ...(this.exposedTo ? { exposedTo: this.exposedTo } : {}),
            };
            // Track the registration before awaiting so dispose() can abort it mid-sync.
            this.registrations.set(capability.id, {
                controller,
                fingerprint: toolFingerprint(capability),
            });
            try {
                await this.modelContext.registerTool(tool, registerOptions);
            }
            catch (error) {
                controller.abort();
                if (generation !== this.generation) {
                    // dispose() already aborted and cleared this registration; the rejection is expected.
                    break;
                }
                this.registrations.delete(capability.id);
                throw error;
            }
        }
        return {
            supported: true,
            registered: this.registeredToolNames,
            unavailable,
        };
    }
    dispose() {
        this.generation += 1;
        for (const registration of this.registrations.values()) {
            registration.controller.abort();
        }
        this.registrations.clear();
    }
}
//# sourceMappingURL=webmcp.js.map