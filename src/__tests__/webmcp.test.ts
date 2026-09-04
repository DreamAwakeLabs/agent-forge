import { describe, expect, it } from 'vitest';
import {
  defineCapability,
  WebMcpAdapter,
  type WebMcpModelContext,
  type WebMcpRegisterOptions,
  type WebMcpToolDefinition,
} from '../index.js';

class MockModelContext implements WebMcpModelContext {
  readonly tools = new Map<string, WebMcpToolDefinition>();

  async registerTool(
    tool: WebMcpToolDefinition,
    options?: WebMcpRegisterOptions,
  ): Promise<void> {
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
