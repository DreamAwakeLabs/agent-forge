import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityUnavailableError,
  defineCapability,
  executeCapability,
  type Capability,
  type CapabilityExecutionEvent,
  type CapabilityObserver,
} from '../index.js';

const emptySchema = { type: 'object', properties: {} };

function capability(overrides: Partial<Capability<unknown, unknown>> = {}) {
  return defineCapability<unknown, unknown>({
    id: 'submit_contact',
    description: 'Submit contact details.',
    inputSchema: emptySchema,
    effect: 'write',
    execute: () => ({ ok: true }),
    ...overrides,
  });
}

function recorder() {
  const events: CapabilityExecutionEvent[] = [];
  const observer: CapabilityObserver = { onEvent: (event) => { events.push(event); } };
  return { events, observer };
}

describe('executeCapability', () => {
  it('emits started then succeeded with a duration and returns the result unchanged', async () => {
    const { events, observer } = recorder();
    const result = { ok: true };

    await expect(executeCapability(capability({ execute: () => result }), {}, { observer }))
      .resolves.toBe(result);

    expect(events.map((event) => event.phase)).toEqual(['started', 'succeeded']);
    const [started, succeeded] = events;
    expect(started).toEqual({
      capabilityId: 'submit_contact',
      effect: 'write',
      consequential: false,
      phase: 'started',
      executionId: expect.stringMatching(/^[0-9a-f]{32}$/),
      startedAt: expect.any(Number),
    });
    expect(succeeded?.executionId).toBe(started?.executionId);
    expect(succeeded?.startedAt).toBe(started?.startedAt);
    expect(succeeded?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('emits failed with the error name and rethrows the original error', async () => {
    const { events, observer } = recorder();
    const error = new TypeError('secret detail');

    await expect(executeCapability(
      capability({ execute: () => { throw error; } }),
      {},
      { observer },
    )).rejects.toBe(error);

    expect(events.map((event) => event.phase)).toEqual(['started', 'failed']);
    expect(events[1]).toMatchObject({ errorName: 'TypeError', durationMs: expect.any(Number) });
  });

  it('reports unavailability as a failed CapabilityUnavailableError', async () => {
    const { events, observer } = recorder();
    const execute = vi.fn();

    await expect(executeCapability(
      capability({ available: () => ({ available: false, reason: 'Pick a plan.' }), execute }),
      {},
      { observer },
    )).rejects.toThrow(new CapabilityUnavailableError('Pick a plan.'));

    expect(execute).not.toHaveBeenCalled();
    expect(events[1]).toMatchObject({ phase: 'failed', errorName: 'CapabilityUnavailableError' });
  });

  it('propagates abort to the capability and reports aborted', async () => {
    const { events, observer } = recorder();
    const controller = new AbortController();
    const running = executeCapability(
      capability({
        execute: (_input, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      }),
      {},
      { observer, signal: controller.signal },
    );

    controller.abort();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    expect(events.map((event) => event.phase)).toEqual(['started', 'aborted']);
    expect(events[1]).toMatchObject({ errorName: 'AbortError', durationMs: expect.any(Number) });
  });

  it('generates a unique execution ID per execution and passes it to the capability', async () => {
    const { events, observer } = recorder();
    const seen: Array<string | undefined> = [];
    const cap = capability({ execute: (_input, { executionId }) => { seen.push(executionId); } });

    for (let i = 0; i < 50; i += 1) {
      await executeCapability(cap, {}, { observer });
    }

    const started = events.filter((event) => event.phase === 'started');
    expect(new Set(started.map((event) => event.executionId)).size).toBe(50);
    expect(seen).toEqual(started.map((event) => event.executionId));
  });

  it('resolves consequential from the effect default and the explicit override', async () => {
    const { events, observer } = recorder();
    await executeCapability(capability({ effect: 'irreversible-write' }), {}, { observer });
    await executeCapability(capability({ effect: 'write', consequential: true }), {}, { observer });
    await executeCapability(capability({ effect: 'read' }), {}, { observer });

    expect(events.filter((event) => event.phase === 'started').map((event) => event.consequential))
      .toEqual([true, true, false]);
  });

  it('isolates observer failures from the capability', async () => {
    const observerErrors: unknown[] = [];
    const syncFailure = new Error('observer broke');

    await expect(executeCapability(capability(), {}, {
      observer: { onEvent: () => { throw syncFailure; } },
      onObserverError: (error) => { observerErrors.push(error); },
    })).resolves.toEqual({ ok: true });
    expect(observerErrors).toEqual([syncFailure, syncFailure]);

    await expect(executeCapability(capability(), {}, {
      observer: { onEvent: () => Promise.reject(new Error('async observer broke')) },
      onObserverError: () => { throw new Error('error seam broke too'); },
    })).resolves.toEqual({ ok: true });

    await expect(executeCapability(capability(), {}, {
      observer: { onEvent: () => { throw syncFailure; } },
    })).resolves.toEqual({ ok: true });
  });

  it('keeps input, output, and error messages out of events', async () => {
    const { events, observer } = recorder();
    const input = { email: 'person@example.com', phone: '+1 555 0100', note: 'INPUT_SENTINEL' };

    await executeCapability(capability({ execute: () => ({ echo: 'OUTPUT_SENTINEL' }) }), input, {
      observer,
    });
    await executeCapability(
      capability({ execute: () => { throw new Error('MESSAGE_SENTINEL person@example.com'); } }),
      input,
      { observer },
    ).catch(() => undefined);
    const hostile = Object.assign(new Error('x'), { name: 'Leak person@example.com' });
    await executeCapability(capability({ execute: () => { throw hostile; } }), input, { observer })
      .catch(() => undefined);

    const serialized = JSON.stringify(events);
    for (const secret of ['person@example.com', '555', 'INPUT_SENTINEL', 'OUTPUT_SENTINEL', 'MESSAGE_SENTINEL']) {
      expect(serialized).not.toContain(secret);
    }
    expect(events.at(-1)).not.toHaveProperty('errorName');
    for (const event of events) {
      expect(Object.keys(event).every((key) => [
        'capabilityId', 'effect', 'consequential', 'phase', 'executionId',
        'startedAt', 'durationMs', 'errorName', 'surface',
      ].includes(key))).toBe(true);
    }
  });

  it('behaves the same without an observer', async () => {
    const error = new RangeError('boom');
    const result = { ok: true };
    await expect(executeCapability(capability({ execute: () => result }), {})).resolves.toBe(result);
    await expect(executeCapability(capability({ execute: () => { throw error; } }), {}))
      .rejects.toBe(error);
  });
});
