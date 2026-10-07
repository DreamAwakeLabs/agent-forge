import { describe, expect, it, vi } from 'vitest';
import {
  defineCapability,
  WebMcpAdapter,
  type WebMcpModelContext,
  type WebMcpRegisterOptions,
  type Capability,
  type WebMcpToolDefinition,
} from '../index.js';

/** Mirrors Chrome: duplicate names reject with InvalidStateError; the registration signal unregisters. */
class MockModelContext implements WebMcpModelContext {
  readonly tools = new Map<string, WebMcpToolDefinition>();
  /** Optional promise each registration waits on, to hold registrations in flight. */
  gate?: Promise<void>;
  started = 0;

  async registerTool(
    tool: WebMcpToolDefinition,
    options?: WebMcpRegisterOptions,
  ): Promise<void> {
    this.started += 1;
    await this.gate;
    if (this.tools.has(tool.name)) {
      throw new DOMException(`Duplicate tool name "${tool.name}".`, 'InvalidStateError');
    }
    if (options?.signal?.aborted) {
      return;
    }
    this.tools.set(tool.name, tool);
    options?.signal?.addEventListener('abort', () => {
      this.tools.delete(tool.name);
    }, { once: true });
  }
}

const emptySchema = { type: 'object', properties: {} };

describe('WebMcpAdapter', () => {
  it('registers only available capabilities and maps safety annotations', async () => {
    const context = new MockModelContext();
    let selected = false;
    const capabilities = [
      defineCapability({
        id: 'read_session',
        description: 'Read the current session.',
        inputSchema: emptySchema,
        effect: 'read',
        untrustedContent: true,
        execute: () => ({ sessionId: 'demo' }),
      }),
      defineCapability({
        id: 'set_focus',
        description: 'Set the coaching focus.',
        inputSchema: emptySchema,
        effect: 'reversible-write',
        available: () => selected || {
          available: false,
          reason: 'Select a shot first.',
        },
        execute: () => ({ focus: 'balance' }),
      }),
    ];

    const adapter = new WebMcpAdapter({ modelContext: context });
    let report = await adapter.sync(capabilities);

    expect(report.registered).toEqual(['read_session']);
    expect(report.unavailable).toEqual([
      { id: 'set_focus', reason: 'Select a shot first.' },
    ]);
    expect(context.tools.get('read_session')?.annotations).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    });

    selected = true;
    report = await adapter.sync(capabilities);
    expect(report.registered).toEqual(['read_session', 'set_focus']);
    expect(context.tools.get('set_focus')?.annotations.readOnlyHint).toBe(false);

    const output = await context.tools.get('read_session')?.execute(
      {},
      { signal: new AbortController().signal },
    );
    expect(JSON.parse(output ?? '{}')).toEqual({ sessionId: 'demo' });

    selected = false;
    await adapter.sync(capabilities);
    expect(context.tools.has('set_focus')).toBe(false);

    adapter.dispose();
    expect(context.tools.size).toBe(0);
  });
});

describe('WebMcpAdapter execute wrapper', () => {
  it('runs when the host passes only the input argument (Chrome 152+)', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    let seenSignal: unknown;
    await adapter.sync([
      defineCapability({
        id: 'echo',
        description: 'Echo the input.',
        inputSchema: emptySchema,
        effect: 'read',
        execute: (input: unknown, { signal }: { signal: AbortSignal }) => {
          seenSignal = signal;
          return input;
        },
      }),
    ]);

    const tool = context.tools.get('echo');
    const execute = tool?.execute as unknown as (input: unknown) => Promise<string>;
    expect(JSON.parse(await execute({ n: 1 }))).toEqual({ n: 1 });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });
});

function tool(id: string, overrides: Partial<Capability<unknown, unknown>> = {}) {
  return defineCapability<unknown, unknown>({
    id,
    description: `Tool ${id}.`,
    inputSchema: emptySchema,
    effect: 'read',
    execute: () => null,
    ...overrides,
  });
}

describe('WebMcpAdapter consequentialHint', () => {
  it('defaults to true only for irreversible writes', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    await adapter.sync([
      tool('read'),
      tool('reversible', { effect: 'reversible-write' }),
      tool('write', { effect: 'write' }),
      tool('irreversible', { effect: 'irreversible-write' }),
    ]);

    const hint = (name: string) => context.tools.get(name)?.annotations.consequentialHint;
    expect(hint('read')).toBe(false);
    expect(hint('reversible')).toBe(false);
    expect(hint('write')).toBe(false);
    expect(hint('irreversible')).toBe(true);
  });

  it('honors an explicit override and re-registers when it changes', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    const submitContact = tool('submit_contact', { effect: 'write', consequential: true });
    await adapter.sync([
      submitContact,
      tool('delete_draft', { effect: 'irreversible-write', consequential: false }),
    ]);

    expect(context.tools.get('submit_contact')?.annotations.consequentialHint).toBe(true);
    expect(context.tools.get('delete_draft')?.annotations.consequentialHint).toBe(false);

    await adapter.sync([{ ...submitContact, consequential: false }]);
    expect(context.tools.get('submit_contact')?.annotations.consequentialHint).toBe(false);
    expect([...context.tools.keys()]).toEqual(['submit_contact']);
  });
});

describe('WebMcpAdapter concurrent sync', () => {
  it('serializes overlapping syncs so the last set wins without duplicate registration', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => tool(id));

    const reports = await Promise.all([
      adapter.sync([a!, b!]),
      adapter.sync([b!, c!]),
      adapter.sync([c!, d!]),
    ]);

    expect(reports.map((report) => report.registered)).toEqual([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'd'],
    ]);
    expect([...context.tools.keys()].sort()).toEqual(['c', 'd']);
    expect(adapter.registeredToolNames).toEqual(['c', 'd']);
  });

  it('keeps later syncs running after one fails', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    context.tools.set('taken', {} as WebMcpToolDefinition);

    const [failed, next] = await Promise.allSettled([
      adapter.sync([tool('taken')]),
      adapter.sync([tool('free')]),
    ]);

    expect(failed.status).toBe('rejected');
    expect(next.status).toBe('fulfilled');
    expect(adapter.registeredToolNames).toEqual(['free']);
  });

  it('dispose during a pending sync unregisters everything', async () => {
    const context = new MockModelContext();
    const adapter = new WebMcpAdapter({ modelContext: context });
    let release!: () => void;
    context.gate = new Promise((resolve) => { release = resolve; });

    const pending = adapter.sync([tool('a'), tool('b')]);
    const queued = adapter.sync([tool('c')]);
    await vi.waitFor(() => expect(context.started).toBe(1));

    adapter.dispose();
    release();
    await Promise.all([pending, queued]);

    expect(context.tools.size).toBe(0);
    expect(context.started).toBe(1);
    expect(adapter.registeredToolNames).toEqual([]);

    // The adapter stays usable after dispose.
    await adapter.sync([tool('a')]);
    expect([...context.tools.keys()]).toEqual(['a']);
  });
});
