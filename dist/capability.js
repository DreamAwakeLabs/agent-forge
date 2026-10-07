export function defineCapability(capability) {
    if (!capability.id.trim()) {
        throw new TypeError('Capability id must not be empty.');
    }
    if (!capability.description.trim()) {
        throw new TypeError(`Capability "${capability.id}" must have a description.`);
    }
    if (!capability.inputSchema || typeof capability.inputSchema !== 'object') {
        throw new TypeError(`Capability "${capability.id}" must have an inputSchema.`);
    }
    return capability;
}
export function resolveCapabilityAvailability(capability) {
    if (!capability.available) {
        return { available: true };
    }
    const result = capability.available();
    if (typeof result === 'boolean') {
        return { available: result };
    }
    return result;
}
export function resolveCapabilityConsequential(capability) {
    return capability.consequential ?? capability.effect === 'irreversible-write';
}
//# sourceMappingURL=capability.js.map