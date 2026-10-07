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
    execute(input: unknown, options?: WebMcpExecutionOptions): string | Promise<string>;
}
export interface WebMcpRegisterOptions {
    signal?: AbortSignal;
    exposedTo?: string[];
}
export interface WebMcpModelContext {
    registerTool(tool: WebMcpToolDefinition, options?: WebMcpRegisterOptions): Promise<void>;
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
    unavailable: Array<{
        id: string;
        reason?: string;
    }>;
}
type AnyCapability = Capability<any, any>;
export declare function isWebMcpSupported(modelContext?: WebMcpModelContext | null): boolean;
export declare class WebMcpAdapter {
    private readonly modelContext;
    private readonly exposedTo?;
    private readonly registrations;
    /** Tail of the sync queue; syncs run one at a time in call order, so the last call wins. */
    private queue;
    /** Incremented by dispose() so syncs queued or running before it stop registering tools. */
    private generation;
    constructor(options?: WebMcpAdapterOptions);
    get supported(): boolean;
    get registeredToolNames(): string[];
    sync(capabilities: readonly AnyCapability[]): Promise<WebMcpSyncReport>;
    private reconcile;
    dispose(): void;
}
export {};
//# sourceMappingURL=webmcp.d.ts.map