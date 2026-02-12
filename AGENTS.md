# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-13
**Commit:** 5125838
**Branch:** main

## OVERVIEW

VSCode extension that bridges VS Code with the OpenCode AI assistant. Discovers/spawns local OpenCode server instances, sends file references to the AI prompt, and provides "Explain and Fix" code actions for diagnostics. TypeScript + VSCode Extension API, built with esbuild.

## STRUCTURE

```
opencode-connector/
├── src/
│   ├── extension.ts         # Entry point: activate/deactivate, command registration, connection orchestration
│   ├── config.ts            # Singleton ConfigManager for vscode settings (port, binaryPath, severityLevels)
│   ├── types.ts             # All shared interfaces (EditorState, API responses, SSE, VCS, etc.)
│   ├── api/
│   │   ├── openCodeClient.ts  # Axios HTTP client with retry/backoff for OpenCode API
│   │   └── errors.ts          # Error hierarchy: Unavailable, Timeout, ApiError, ServerError, etc.
│   ├── context/
│   │   └── contextManager.ts  # Subscribes to VSCode events, debounces editor state collection
│   ├── instance/
│   │   └── instanceManager.ts # Platform-aware process discovery (tasklist/netstat on Win, pgrep/lsof on Unix)
│   ├── providers/
│   │   └── codeActionProvider.ts # "Explain and Fix" lightbulb actions for diagnostics
│   └── utils/
│       ├── workspace.ts       # Multi-root workspace detection, path normalization, hashing
│       ├── debounce.ts        # Debounce utilities (trailing, leading, with options)
│       └── promptFormatter.ts # Formats diagnostic info into OpenCode prompt strings
├── test/                    # Mirrors src/ structure
│   ├── api/                 # Unit tests for OpenCodeClient
│   ├── context/             # Unit tests for ContextManager
│   ├── instance/            # Unit tests for InstanceManager + port scanner
│   ├── providers/           # Unit tests for CodeActionProvider
│   ├── utils/               # Unit tests for workspace/debounce/promptFormatter
│   ├── suite/               # Mocha integration tests (VSCode extension host)
│   └── runTest.ts           # Integration test launcher
├── __mocks__/vscode.ts      # VSCode API mock for Vitest unit tests
├── esbuild.js               # Build script: bundles extension + test runner
├── temp/                    # Reference: cloned opencode repo (NOT project code)
└── out/                     # Build output (gitignored)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new API endpoint | `src/api/openCodeClient.ts` | Follow existing pattern: typed response, validation, error transform |
| Add new VSCode command | `src/extension.ts` → `registerCommands()` | Register under both `opencodeConnector.*` and `opencode.*` prefixes |
| Change connection behavior | `src/extension.ts` → `ensureConnected()` | 4-step cascade: current client → discovery → auto-spawn → fallback port |
| Fix process detection | `src/instance/instanceManager.ts` | Platform branches: `scanProcessesWindows()` vs `scanProcessesUnix()` |
| Add new config option | `src/config.ts` + `package.json` contributes.configuration | Singleton, read via `vscode.workspace.getConfiguration('opencode')` |
| Add new type/interface | `src/types.ts` | All domain types live here |
| Workspace path logic | `src/utils/workspace.ts` | Handles multi-root, URI↔fsPath |
| Add new code action | `src/providers/codeActionProvider.ts` | Implements `vscode.CodeActionProvider`; uses `promptFormatter` for prompt text |
| Format diagnostic prompts | `src/utils/promptFormatter.ts` | Owns its own `DiagnosticInfo`/`UriInfo` interfaces (testable without vscode) |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `activate` | function | extension.ts:210 | Extension entry — wires all managers, registers commands/providers |
| `deactivate` | function | extension.ts:571 | Cleanup in reverse init order |
| `ensureConnected` | function | extension.ts:97 | Connection cascade: test → discover → spawn → fallback |
| `discoverAndConnect` | function | extension.ts:38 | Scans processes, matches workspace dir via `/path` endpoint |
| `OpenCodeClient` | class | api/openCodeClient.ts:63 | HTTP client with axios-retry, exponential backoff, error transform |
| `OpenCodeError` | abstract class | api/errors.ts:6 | Base error — all API errors extend this with string `code` field |
| `ConfigManager` | class | config.ts:7 | Singleton — wraps `vscode.workspace.getConfiguration` |
| `InstanceManager` | class | instance/instanceManager.ts:89 | Singleton — process scan, port check, terminal spawn |
| `PlatformUtils` | const object | instance/instanceManager.ts:40 | OS detection, shell prefix helpers |
| `ContextManager` | class | context/contextManager.ts:57 | Event subscriber — debounced editor state aggregation |
| `OpenCodeCodeActionProvider` | class | providers/codeActionProvider.ts:24 | "Explain and Fix" lightbulb code actions |
| `WorkspaceUtils` | const object | utils/workspace.ts:41 | Static utility — workspace detection, path ops |
| `formatExplainAndFixPrompt` | function | utils/promptFormatter.ts:40 | Builds `@file#Lline` prompt string from diagnostic info |

## CONVENTIONS

- **Singletons**: `ConfigManager` and `InstanceManager` use `getInstance()` / `resetInstance()` pattern
- **Imports**: Prettier sorts with `@trivago/prettier-plugin-sort-imports` — local relative (`./`), then parent (`../`), then packages
- **Config defaults**: Each module defines `DEFAULT_CONFIG` as `Required<ConfigInterface>`, merged with `??` in constructor
- **Error hierarchy**: All API errors extend `OpenCodeError` (abstract) base class with string `code` field
- **Commands**: Registered under BOTH `opencodeConnector.*` and `opencode.*` prefixes (dual registration)
- **Platform branching**: Windows uses `cmd /c` + `tasklist`/`netstat`; Unix uses `sh -c` + `pgrep`/`lsof`
- **Validation**: API responses are validated inline (type guard checks on response fields)
- **Testable interfaces**: `promptFormatter.ts` defines its own `DiagnosticInfo`/`UriInfo` instead of depending on `vscode` — enables unit testing without extension host
- **Default exports**: Each module has a `export default` at the bottom (class instance or object), alongside named exports

## ANTI-PATTERNS (THIS PROJECT)

- Do NOT add `index.ts` barrel exports — modules are imported directly by file path
- Do NOT use PowerShell for Windows process scanning — use native `cmd /c tasklist`/`netstat` (performance: 200ms vs 2s)
- Do NOT send context to OpenCode on every editor event — always debounce (min 300ms)
- Terminal spawn: Do NOT use `PlatformUtils.getCommandWithExtension()` for terminal commands — the integrated terminal resolves PATH naturally
- The 2000ms settling delay after server spawn in `ensureConnected()` is intentional — the HTTP server responds before TUI is ready
- Do NOT use `testConnection()` via the global retry-enabled client for quick connectivity checks — `testConnection()` bypasses the retry interceptor intentionally

## COMMANDS

```bash
npm run compile          # esbuild: bundles extension + tests to out/
npm run watch            # esbuild: watch mode
npm run test:unit        # vitest run
npm run test:integration # launches VSCode test host
npm run test             # both unit + integration
npm run lint             # eslint on src/
npm run format           # prettier --write
npm run format:check     # prettier --check (CI)
```

## NOTES

- `temp/` contains a cloned opencode repo used as reference — it is NOT part of this extension's source
- `.vscode-test/` is auto-downloaded by `@vscode/test-electron` for integration tests — do not manually modify
- Default OpenCode port is 4096 (range scanned: 4096-5096 for auto-spawn)
- `activate()` signature is non-standard: takes `(extensionUri, context)` instead of just `(context)` — the build wires this
- Test mocking: `__mocks__/vscode.ts` stubs the entire VSCode API for Vitest (node environment, no extension host)
- Strict TypeScript: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` — all enabled
- No CI/CD config present — no `.github/workflows` or `Makefile`
- Engine compatibility: targets both VSCode (`^1.94.0`) and Windsurf (`^1.0.0`)
