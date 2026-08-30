import { describe, expect, it } from 'vitest';
import {
  defineCapability,
  resolveCapabilityAvailability,
} from '../index.js';

const schema = { type: 'object', properties: {} };

describe('defineCapability', () => {
  it('rejects an empty id', () => {
    expect(() => defineCapability({
      id: '   ',
      description: 'Read state',
      inputSchema: schema,
      effect: 'read',
      execute: () => ({ ok: true }),
    })).toThrow(/id must not be empty/i);
  });

  it('resolves dynamic availability', () => {
    let ready = false;
    const capability = defineCapability({
      id: 'get_state',
      description: 'Read current application state.',
      inputSchema: schema,
      effect: 'read',
      available: () => ready
        ? true
        : { available: false, reason: 'Select an item first.' },
      execute: () => ({ ready }),
    });

    expect(resolveCapabilityAvailability(capability)).toEqual({
      available: false,
      reason: 'Select an item first.',
    });
    ready = true;
    expect(resolveCapabilityAvailability(capability)).toEqual({ available: true });
  });
});
