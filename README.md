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
- cancellation-aware execution
- lifecycle-managed WebMCP registration

## WebMCP adapter

The adapter follows the current `document.modelContext.registerTool()` shape. Registration is owned by an `AbortController`, and the execution `AbortSignal` is passed through to the domain capability.

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

The first reference consumer is [`DreamAwakeLabs/webmcp-replay-room`](https://github.com/DreamAwakeLabs/webmcp-replay-room), a Vue tennis-session review workspace built for the 2026 WebMCP Challenge.

## Development

Requires Node.js 20.19+.

```bash
npm install
npm run check
```

## Status

Early experimental implementation. WebMCP is still a proposed web standard and the browser API can change. The adapter isolates that churn from application capability definitions.

## License

Apache-2.0
