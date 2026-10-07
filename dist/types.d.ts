export type JsonSchema = Record<string, unknown>;
export type CapabilityEffect = 'read' | 'reversible-write' | 'write' | 'irreversible-write';
export interface CapabilityAvailability {
    available: boolean;
    reason?: string;
}
export type CapabilityAvailabilityCheck = () => boolean | CapabilityAvailability;
export interface CapabilityExecutionContext {
    signal: AbortSignal;
}
export interface Capability<TInput = Record<string, unknown>, TResult = unknown> {
    /** Stable semantic identifier. Adapter surfaces should preserve this name. */
    id: string;
    /** Optional human-facing label. */
    title?: string;
    /** Agent-facing description of when and why to use this capability. */
    description: string;
    /** JSON Schema for the capability input. */
    inputSchema: JsonSchema;
    /** Explicit effect classification. There is deliberately no implicit default. */
    effect: CapabilityEffect;
    /** True when results can contain user/model/external content that an agent must not trust as instructions. */
    untrustedContent?: boolean;
    /**
     * True when the capability performs a significant, real-world, or non-reversible action, such as
     * submitting a person's contact details to a business. Defaults to true for 'irreversible-write'
     * and false otherwise; a reversible or ordinary write is not assumed to be consequential.
     */
    consequential?: boolean;
    /** Optional dynamic availability predicate, evaluated during sync and again at execution time. */
    available?: CapabilityAvailabilityCheck;
    /** Domain operation. It should not depend on a particular agent transport. */
    execute(input: TInput, context: CapabilityExecutionContext): TResult | Promise<TResult>;
}
export interface ResolvedCapabilityAvailability {
    available: boolean;
    reason?: string;
}
//# sourceMappingURL=types.d.ts.map