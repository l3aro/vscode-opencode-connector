# AGENTS.md - Agentic Coding Guidelines

This file provides guidelines and commands for agentic coding agents operating in this repository.

## Project Overview

This is a VS Code extension that integrates OpenCode AI assistant with VS Code. It's a TypeScript project using VS Code extension APIs.

---

## Commands

### Build & Development

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode - recompile on file changes |
| `npm run pack` | Package extension as .vsix file |

### Testing

| Command | Description |
|---------|-------------|
| `npm run test` | Run all tests (unit + integration) |
| `npm run test:unit` | Run unit tests only (vitest) |
| `npm run test:integration` | Run integration tests only |

**Running a single test file:**
```bash
# Using vitest directly for unit tests
npx vitest run test/utils/debounce.test.ts

# Or run with pattern matching
npx vitest run --filter "debounce"
```

### Linting & Formatting

| Command | Description |
|---------|-------------|
| `npm run lint` | Run ESLint on src directory |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without modifying |

---

## Code Style Guidelines

### TypeScript Configuration

- **Strict mode**: Enabled - no implicit any, no implicit returns
- **Module system**: CommonJS
- **Target**: ES2020
- **Unused variables**: Not allowed (`noUnusedLocals`, `noUnusedParameters`)

### Formatting (Prettier)

| Setting | Value |
|---------|-------|
| Semi-colons | Yes |
| Tab width | 2 |
| Print width | 100 |
| Quotes | Single quotes |
| Trailing commas | ES5 style |
| Arrow parens | Avoid when possible |

### Import Sorting

The project uses `@trivago/prettier-plugin-sort-imports` with this order:
1. Relative imports (`./`, `../`)
2. External packages (`^[a-z-]+$`)

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `OpenCodeClient`, `ConfigManager` |
| Interfaces/Types | PascalCase | `OpenCodeClientConfig`, `HealthResponse` |
| Functions | camelCase | `handleAddToPrompt`, `getActiveFileRef` |
| Variables | camelCase | `connectionService`, `outputChannel` |
| Constants | PascalCase or UPPER_SNAKE | `DEFAULT_CONFIG` |
| Files (classes) | PascalCase | `connectionService.ts` |
| Files (utilities) | camelCase | `debounce.ts`, `workspace.ts` |

### Code Organization

```
src/
├── api/           # HTTP clients, API types
├── commands/      # VS Code command handlers
├── config.ts      # Configuration management
├── connection/    # Connection service
├── instance/     # Instance management
├── providers/    # VS Code providers (CodeAction)
├── statusBar.ts  # Status bar management
├── types.ts      # Shared types
└── utils/        # Utility functions
```

### JSDoc Comments

Document all exported functions and classes with JSDoc:
```typescript
/**
 * Brief description of what the function does.
 * @param paramName - Description of parameter
 * @returns Description of return value
 */
export async function myFunction(paramName: string): Promise<void> {
  // ...
}
```

### Error Handling

- Use custom error classes extending `Error` or `OpenCodeError`
- Always catch and handle async errors with try/catch
- Use type-safe error casting: `(err as Error).message`
- Log errors to output channel before showing user messages

**Good pattern:**
```typescript
try {
  const result = await someAsyncOperation();
  outputChannel.info('Operation succeeded');
} catch (err) {
  outputChannel.error(`Operation failed: ${(err as Error).message}`);
  await vscode.window.showErrorMessage(`Failed: ${(err as Error).message}`);
}
```

### VS Code Extension Patterns

- Register commands with `vscode.commands.registerCommand`
- Subscribe to disposables via `extensionContext.subscriptions.push()`
- Use `LogOutputChannel` for user-accessible logging (View → Output)
- Return early with user messages for validation failures
- Use `async/await` for all VS Code APIs

### Type Annotations

- Always use explicit return types on exported functions
- Use `interface` for object shapes, `type` for unions/aliases
- Prefer `type` over `interface` for simple configs
- Use `readonly` for immutable arrays

### Testing Patterns

- Unit tests use Vitest with `describe`, `it`, `expect`
- Integration tests use VS Code test runner (`@vscode/test-electron`)
- Test files co-located in `test/` directory matching `src/` structure
- Mock VS Code APIs where needed

---

## Pre-Commit Checklist

Before submitting any changes:

1. [ ] Run `npm run lint` - fix any ESLint errors
2. [ ] Run `npm run format` - ensure consistent formatting
3. [ ] Run `npm run test:unit` - unit tests pass
4. [ ] Run `npm run compile` - TypeScript compiles without errors
5. [ ] Check for any `// TODO:` comments that should be addressed
