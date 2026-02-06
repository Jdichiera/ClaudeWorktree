# Claude Worktree

A desktop app for running multiple Claude agents in parallel, each in isolated git worktrees.

Inspired by [Conductor](https://www.conductor.build/).

## Features

- **Multi-agent orchestration** - Run separate Claude sessions per worktree
- **Git worktree management** - Create, switch, and delete worktrees from the UI
- **Multi-repo support** - Work across multiple repositories simultaneously
- **Tool visibility** - See file edits and bash output in a side panel

## Install

```bash
npm install
npm run package
```

The app will be in `release/mac-arm64/Claude Worktree.app` (or `mac-x64` for Intel).

## Development

```bash
npm run dev
```

## Tech Stack

- Electron + React + TypeScript
- Claude CLI for agent sessions
- Zustand for state management

## License

MIT
