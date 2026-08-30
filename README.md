# Agent Forge

A protocol-neutral capability framework for exposing application functionality as safe, typed tools across WebMCP, MCP, voice agents, DASP, and other agent runtimes.

> Define an application capability once. Bind it to the agent runtime that makes sense for the surface.

Agent Forge is intentionally small at this stage. The first adapter targets the current WebMCP Imperative API while the core capability model stays browser- and framework-neutral.

## Why

Applications increasingly have several agent surfaces:

- browser agents need page-local state and visible UI actions through WebMCP
- headless agents need MCP or API tools
- embodied agents need voice/runtime tools
- spatial systems may expose capabilities through protocols such as DASP

The domain operation should not be rewritten for every transport. Agent Forge provides a common capability description and thin adapters around it.

## Current package

`@dreamawakelabs/agent-forge` currently contains:

- `CapabilityRegistry`: runtime registration and dynamic availability
- capability metadata: JSON input schema, effect classification, output trust
- `bindWebMCP`: current WebMCP Imperative API adapter
- cancellation propagation with `AbortSignal`
- automatic WebMCP tool lifecycle when capabilities become available or unavailable

## Example

```ts
import { CapabilityRegistry, bindWebMCP } from '@dreamawakelabs/agent-forge';

const registry = new CapabilityRegistry();

registry.set({
  name: 'get_selected_item',
  title: 'Get selected item',
  description: 'Return the item currently selected in the application.',
  inputSchema: { type: 'object', properties: {} },
  effect: 'read',
  execute: () => ({ id: 'item-42', name: 'Example' }),
});

const binding = bindWebMCP(registry);
await binding.sync();

// Later:
binding.dispose();
```

## Capability model

A capability describes semantics, not UI mechanics. Prefer:

```text
set_coaching_focus({ metric: "balance" })
```

over:

```text
click_button({ selector: "#focus-balance" })
```

The initial model includes:

- `name`, `title`, `description`
- `inputSchema`
- `effect`: `read | reversible | consequential`
- `untrustedOutput`
- `isAvailable()` for page/runtime state
- `execute(input, { signal })`

Adapters translate those semantics into runtime-specific metadata.

## WebMCP status

WebMCP is experimental. This implementation follows the Chrome Imperative API documentation updated August 20, 2026 and the W3C Web Machine Learning Community Group draft dated August 26, 2026. The Community Group report is **not a W3C Standard** and API details can still change.

For local Chrome testing, enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.

References:

- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://webmachinelearning.github.io/webmcp/

## Development

```bash
npm install
npm test
npm run build
```

Requires Node.js 20+.

## Roadmap

Near-term work is driven by real integrations rather than speculative adapters:

1. WebMCP Replay Room reference application
2. policy linting and confirmation semantics
3. deterministic capability contract tests
4. browser-agent journey evals
5. additional adapters only when a real application needs them

## License

MIT
