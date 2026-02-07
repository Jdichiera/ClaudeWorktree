# CLAUDE.md

## Commands

- `npm run dev` — development with hot reload
- `npm run build` — production build
- `npm run package` — build + package macOS app
- `npm test` — Jest unit tests
- `npm test -- path/to/test.ts` — single test file
- `npm test -- path/to/test.ts -t "test name"` — single test case
- `npm run test:e2e` — Playwright E2E tests
- `npm run typecheck` — TypeScript type checking (`tsc --noEmit`)

## Architecture

Electron three-process model: main, preload, renderer.

- **Main process** (`src/main/`) — window management, IPC handlers, git and agent services
- **Preload** (`src/preload/`) — secure IPC bridge via `contextBridge`
- **Renderer** (`src/renderer/`) — React 19 + Zustand UI
- **Shared types** (`src/shared/types.ts`) — all TypeScript interfaces and IPC channel constants

IPC pattern: request-response via `invoke` for git/agent operations, event streaming for agent output. AgentManager spawns `claude` CLI as a child process with `--print --output-format text`. GitService wraps `git` CLI via `spawn()` for worktree operations.

State is in-memory only (Zustand store), no persistence across restarts.

`swift-legacy/` contains deprecated Swift implementation kept for reference.

## Key Patterns

- **Security-first**: sandbox enabled, context isolation, path validation, env var sanitization, prompt size limits
- **Per-worktree agent sessions**: each git worktree gets an independent Claude agent process
- **Path alias**: `@shared` maps to `src/shared/` across all tsconfig files
- **Multiple tsconfigs**: `tsconfig.json` (base), `tsconfig.node.json` (main+preload), `tsconfig.web.json` (renderer), `tsconfig.test.json` (tests)
