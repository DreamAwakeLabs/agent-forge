import {
  resolveCapabilityAvailability,
  resolveCapabilityConsequential,
} from './capability.js';
import type { Capability, JsonSchema } from './types.js';

export interface WebMcpToolAnnotations {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
  /** Significant, real-world, or non-reversible action. Always set by this adapter. */
  consequentialHint?: boolean;
}

export interface WebMcpExecutionOptions {
  signal: AbortSignal;
}

export interface WebMcpToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: WebMcpToolAnnotations;
  /** Chrome 152+ invokes this with only `input`; `options` is not guaranteed. */
  execute(
    input: unknown,
    options?: WebMcpExecutionOptions,
  ): string | Promise<string>;
}

export interface WebMcpRegisterOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

export interface WebMcpModelContext {
  registerTool(
    tool: WebMcpToolDefinition,
    options?: WebMcpRegisterOptions,
  ): Promise<void>;
}

export interface WebMcpAdapterOptions {
  /** Dependency injection seam for tests, embedded agents, and future browser implementations. */
  modelContext?: WebMcpModelContext | null;
  /** Secure origins that may discover this document's tools. Omit for same-origin/browser-agent use. */
  exposedTo?: string[];
}

export interface WebMcpSyncReport {
  supported: boolean;
  registered: string[];
  unavailable: Array<{ id: string; reason?: string }>;
}

interface Registration {
  controller: AbortController;
  fingerprint: string;
}

type AnyCapability = Capability<any, any>;

type WebMcpDocument = Document & {
  modelContext?: WebMcpModelContext;
};

function browserModelContext(): WebMcpModelContext | null {
  if (typeof document === 'undefined') {
    return null;
  }
  return (document as WebMcpDocument).modelContext ?? null;
}

export function isWebMcpSupported(
  modelContext: WebMcpModelContext | null = browserModelContext(),
): boolean {
  return Boolean(modelContext?.registerTool);
}

function toolFingerprint(capability: AnyCapability): string {
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

function serializeResult(result: unknown, capabilityId: string): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result === undefined) {
    return JSON.stringify({ ok: true, capability: capabilityId });
  }
  return JSON.stringify(result);
}

export class WebMcpAdapter {
  private readonly modelContext: WebMcpModelContext | null;
  private readonly exposedTo?: string[];
  private readonly registrations = new Map<string, Registration>();
  /** Tail of the sync queue; syncs run one at a time in call order, so the last call wins. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Incremented by dispose() so syncs queued or running before it stop registering tools. */
  private generation = 0;

  constructor(options: WebMcpAdapterOptions = {}) {
    this.modelContext = options.modelContext === undefined
      ? browserModelContext()
      : options.modelContext;
    this.exposedTo = options.exposedTo;
  }

  get supported(): boolean {
    return isWebMcpSupported(this.modelContext);
  }

  get registeredToolNames(): string[] {
    return [...this.registrations.keys()].sort();
  }

  sync(capabilities: readonly AnyCapability[]): Promise<WebMcpSyncReport> {
    const generation = this.generation;
    const run = this.queue.then(() => this.reconcile(capabilities, generation));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async reconcile(
    capabilities: readonly AnyCapability[],
    generation: number,
  ): Promise<WebMcpSyncReport> {
    const unavailable: Array<{ id: string; reason?: string }> = [];
    const desired = new Map<string, AnyCapability>();

    for (const capability of capabilities) {
      const availability = resolveCapabilityAvailability(capability);
      if (availability.available) {
        desired.set(capability.id, capability);
      } else {
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
      const tool: WebMcpToolDefinition = {
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
          const signal = options?.signal ?? new AbortController().signal;
          const currentAvailability = resolveCapabilityAvailability(capability);
          if (!currentAvailability.available) {
            throw new Error(
              currentAvailability.reason ?? `Capability "${capability.id}" is not currently available.`,
            );
          }
          const result = await capability.execute(input, { signal });
          return serializeResult(result, capability.id);
        },
      };

      const registerOptions: WebMcpRegisterOptions = {
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
      } catch (error) {
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

  dispose(): void {
    this.generation += 1;
    for (const registration of this.registrations.values()) {
      registration.controller.abort();
    }
    this.registrations.clear();
  }
}
