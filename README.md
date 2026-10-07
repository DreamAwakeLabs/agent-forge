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
