import type { Capability, ResolvedCapabilityAvailability } from './types.js';
export declare function defineCapability<TInput, TResult>(capability: Capability<TInput, TResult>): Capability<TInput, TResult>;
export declare function resolveCapabilityAvailability(capability: Capability<unknown, unknown>): ResolvedCapabilityAvailability;
export declare function resolveCapabilityConsequential(capability: Capability<unknown, unknown>): boolean;
//# sourceMappingURL=capability.d.ts.map