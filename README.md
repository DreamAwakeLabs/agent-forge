# Agent Forge

**Agent Forge makes applications agent-addressable. Define a semantic capability once, then expose it through WebMCP, MCP, voice agents, DASP, or other agent runtimes.**

This repository starts deliberately small. The first adapter targets the current WebMCP Imperative API, while the capability model itself has no dependency on WebMCP or a UI framework.

```text
Application domain operation
          │
          ▼
      Capability
          │
      Agent Forge
          │
   ┌──────┼──────────┬──────────┐
   ▼      ▼          ▼          ▼
 WebMCP   MCP       DASP       Voice
  now    later      later      later
```

## Why

Agent interfaces should call semantic application operations, not replay mouse clicks. A capability carries the contract an agent needs while the application keeps ownership of authorization, domain rules, state, and UI effects.

Agent Forge currently models:

- stable capability IDs and agent-facing descriptions
- JSON Schema inputs
- explicit effect classification (`read`, `reversible-write`, `write`, `irreversible-write`)
- dynamic availability
- untrusted-content metadata
- consequential-action metadata
- cancellation-aware execution
- lifecycle-managed WebMCP registration
- privacy-safe execution lifecycle observation

## Install

Agent Forge is not published to a registry. Install it from GitHub, pinned to a commit:

```bash
npm install "github:DreamAwakeLabs/agent-forge#<commit-sha>"
```

The compiled `dist/` is committed, and the package defines no `prepare`, `build`, or install
lifecycle scripts. npm therefore downloads the commit tarball over HTTPS and uses it as-is: no
SSH, no devDependency install, and no build step on the consumer side. This works on npm 10 and 11.
(npm 10.9 crashes while building git dependencies whose `prepare` step installs vitest 4.)

CI runs `npm run compile` and fails if the committed `dist/` differs from the fresh build. After
changing `src/`, run `npm run check` and commit the regenerated `dist/` with your change.

## WebMCP adapter

The adapter follows the current `document.modelContext.registerTool()` shape. Registration is owned by an `AbortController`, and the execution `AbortSignal` is passed through to the domain capability.

Capability fields map to WebMCP tool annotations:

| Capability | Annotation | Default |
| --- | --- | --- |
| `effect === 'read'` | `readOnlyHint` | — |
| `untrustedContent` | `untrustedContentHint` | `false` |
| `consequential` | `consequentialHint` | `true` for `'irreversible-write'`, otherwise `false` |

Set `consequential: true` on any capability that takes a significant, real-world, or non-reversible
action, even when its effect is an ordinary `'write'`, for example submitting a person's contact details to a business:

```ts
const requestCallback = defineCapability({
  id: 'request_callback',
  description: "Send the user's name and phone number to the business so it can call them back.",
  inputSchema: callbackSchema,
  effect: 'write',
  consequential: true,
  execute: (input) => api.requestCallback(input),
});
```

```ts
import { defineCapability, WebMcpAdapter } from '@dreamawakelabs/agent-forge';

const getSelection = defineCapability({
  id: 'get_current_selection',
  description: 'Return the item currently selected in the workspace.',
  inputSchema: { type: 'object', properties: {} },
  effect: 'read',
  available: () => selection.value
    ? true
    : { available: false, reason: 'Nothing is selected.' },
  execute: () => selection.value,
});

const adapter = new WebMcpAdapter();
await adapter.sync([getSelection]);

// When application state changes, sync again so tool availability follows it.
await adapter.sync([getSelection]);

// Component/app teardown unregisters every owned tool.
adapter.dispose();
```

`sync()` may be called concurrently, for example from several reactive watchers. Calls run one at a
time in call order, so the last call's capability set wins and no tool name is registered twice.
`dispose()` unregisters every tool, including one whose registration is still in flight, and makes
syncs that were already queued register nothing. The adapter can be synced again after `dispose()`.

The first reference consumer is [`DreamAwakeLabs/webmcp-replay-room`](https://github.com/DreamAwakeLabs/webmcp-replay-room), a Vue tennis-session review workspace built for the 2026 WebMCP Challenge.

## Execution observability

Agent Forge can tell you which capability ran, through which surface, how it ended, and how long it
took. It does not define an observability backend: you pass an observer and forward events wherever
you like, such as logs, metrics, or traces.

```text
domain operation
      ↓
  Capability
      ↓
execution lifecycle observer   (Agent Forge: metadata-only events)
      ↓
optional telemetry consumer    (yours: logger, metrics, tracing)
```

Each execution emits `started`, then exactly one of `succeeded`, `failed`, or `aborted`:

```ts
interface CapabilityExecutionEvent {
  capabilityId: string;
  effect: CapabilityEffect;
  consequential: boolean;      // resolved, including the irreversible-write default
  phase: 'started' | 'succeeded' | 'failed' | 'aborted';
  executionId: string;         // random, per execution, shared by its events
  startedAt: number;           // epoch ms
  durationMs?: number;         // on succeeded / failed / aborted
  errorName?: string;          // e.g. 'TypeError'; never the message
  surface?: string;            // 'webmcp', 'mcp', 'voice', 'embedded', or any adapter-defined value
}
```

**Privacy:** events are metadata only. They never contain tool input, tool output, prompts, error
messages, or other free text. `errorName` is included only when it looks like a class name. There
is deliberately no `metadata` field. To add sanitized application detail, record it yourself in the
capability and join it on `context.executionId`, which every execution receives.

**Isolation:** observers are called synchronously and returned promises are not awaited. An
observer that throws or rejects never changes the capability's result or error. Pass
`onObserverError` to see those failures; otherwise they are ignored.

`aborted` means the execution's `AbortSignal` was aborted when the capability threw.

```ts
const adapter = new WebMcpAdapter({
  observer: {
    onEvent(event) {
      if (event.phase !== 'started') {
        metrics.histogram('capability.duration_ms', event.durationMs, {
          capability: event.capabilityId,
          outcome: event.phase,
          surface: event.surface,
        });
      }
    },
  },
  onObserverError: (error) => console.warn('capability observer failed', error),
});
```

Other adapters, or applications that call capabilities directly, use the same wrapper. It checks
availability, assigns the execution ID, emits the events, and returns or rethrows the capability's
own result or error:

```ts
import { executeCapability } from '@dreamawakelabs/agent-forge';

const result = await executeCapability(requestCallback, input, {
  signal,
  surface: 'voice',
  observer: { onEvent: (event) => console.debug('[capability]', event) },
});
```

When a capability is unavailable at execution time, the wrapper throws `CapabilityUnavailableError`.
Its message is the availability reason.

## Development

Requires Node.js 20.19+.

```bash
npm ci
npm run check   # typecheck, test, and compile dist/
```

## Status

Early experimental implementation. WebMCP is still a proposed web standard and the browser API can change. The adapter isolates that churn from application capability definitions.

## License

Apache-2.0
