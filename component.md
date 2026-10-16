# Chat UI Project Context

## Stack
- React + TypeScript + Vite; Bun for packages and scripts.
- `@assistant-ui/react` (`0.15.29` reported): chat runtime and message state.
- shadcn CLI: copies editable component source into this repo; it is not a runtime UI service.
- Base UI + Nova preset: accessible UI primitives and visual defaults.
- Tailwind CSS v4 + `@tailwindcss/vite`: styling.
- Backend: custom API; no specific AI provider or backend framework is required.

## Key paths
- `src/App.tsx`: application layout.
- `src/chat/ChatRuntimeProvider.tsx`: assistant-ui runtime and API adapter.
- `src/components/assistant-ui/elements/`: chat UI (`thread.aui.tsx`, `thread-list.aui.tsx`, Markdown, attachments, reasoning, tool renderers).
- `src/components/ui/`: editable primitive components (button, input, textarea, dialog, tooltip, etc.).
- `src/hooks/`, `src/lib/`: shared hooks and utilities.
- `src/index.css`: global CSS; Tailwind v4 import is `@import "tailwindcss";`.
- `components.json`: shadcn preset, Base UI choice, CSS path and aliases.

## Architecture
`Research UI → entity API module → shared Axios client → own backend`

Keep backend-specific logic in `src/entities/<entity>/api.ts` and shared HTTP configuration in `src/lib/api-client.ts`, not in presentation components. Define an API schema owned by this project and map between it and assistant-ui's message format in the adapter. Never couple the backend to the library's internal message shape unnecessarily.

## Runtime pattern
The current research UI manages session/conversation IDs and message history in the page, calling the entity API functions directly. A conversation starts after a successful scrape; its first `POST /chat` sends `previous_interaction_id: null`, and subsequent messages use the ID returned by the backend. Selecting a saved conversation loads its turns from `GET /chat/conversation`. If the assistant-ui thread is adopted later, `ChatRuntimeProvider` should map its message state and active IDs to the existing entity API contract rather than calling the backend from UI components. `VITE_*` values are public browser config; never store secrets there. Axios errors should remain visible to the caller, and cancellation should be wired through when needed.

For streaming, parse the backend's actual protocol (SSE, NDJSON, etc.) in an async-generator adapter. Yield the full accumulated text, not only the latest chunk. This backend currently returns complete, non-streaming responses. UI components alone do not provide backend streaming, persistence, file uploads, tool execution, or durable conversation history.

## Usage
Import generated components with the `@/` alias, for example:
```tsx
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ChatRuntimeProvider } from "@/chat/ChatRuntimeProvider";

export default function App() {
  return <ChatRuntimeProvider><main className="h-dvh"><Thread /></main></ChatRuntimeProvider>;
}
```
Use actual exports and paths from the files in this repo. Runtime-connected UI must be rendered inside `AssistantRuntimeProvider`.

## Configuration rules
- Vite alias `@` must resolve to the absolute path of `src`.
- TypeScript `paths`: `"@/*": ["./src/*"]`. Do not add `baseUrl` if the installed TypeScript flags it as deprecated.
- Tailwind v4 Vite plugin must be enabled in `vite.config.ts`; CSS entry imports `tailwindcss`.
- This project uses Base UI, not Radix UI. Check the actual primitive's API before copying examples from another library.
- Known fix: in `src/components/assistant-ui/elements/tooltip-icon-button.tsx`, use `<TooltipProvider delay={0}>`, not `delayDuration={0}` (the latter failed TypeScript checking with the installed Base UI types).
- Generated shadcn components are source files in this repo; modify them locally as needed.

## Commands
```bash
bun add <package>
bun add -d <package>
bun run dev
bunx tsc -b
bun run build
bunx shadcn@latest add <component>
```

## Design principles
1. Keep UI, runtime adapter, and backend contract separate.
2. Preserve auth, cancellation, errors, safe Markdown/link rendering, and accessibility.
3. Keep secrets on the backend. Add authentication and correct CORS policy before production.
4. Do not assume thread-list UI persists history; implement API-backed history separately when needed.

## References
- assistant-ui custom runtimes: https://www.assistant-ui.com/docs/runtimes/custom/overview
- LocalRuntime: https://www.assistant-ui.com/docs/runtimes/custom/local-runtime
- shadcn/ui: https://ui.shadcn.com/docs/installation
- Tailwind + Vite: https://tailwindcss.com/docs/installation/using-vite
