/**
 * Mock vscode module for testing workspace utilities
 */
import { vi } from 'vitest';

// Mock StatusBarItem
const mockStatusBarItem = {
  name: '',
  text: '',
  tooltip: '',
  command: '',
  alignment: 1,
  priority: 0,
  show: vi.fn(),
  hide: vi.fn(),
};

// Mock QuickPick
const mockQuickPick = {
  title: '',
  placeholder: '',
  items: [] as Array<{ label: string; description?: string }>,
  selectedItems: [] as Array<{ label: string; description?: string }>,
  onDidAccept: vi.fn(),
  onDidChangeSelection: vi.fn(),
  onDidHide: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(),
  dispose: vi.fn(),
};

const mockVscode = {
  window: {
    createStatusBarItem: vi.fn(() => ({ ...mockStatusBarItem })),
    createQuickPick: vi.fn(() => ({ ...mockQuickPick })),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: undefined,
    name: undefined,
    asRelativePath: vi.fn((uri: unknown) => {
      return (
        (uri as { fsPath?: string; path?: string }).fsPath || (uri as { path?: string }).path || ''
      );
    }),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
  },
  Uri: {
    parse: vi.fn((str: string) => ({
      fsPath: str,
      toString: () => str,
    })),
    joinPath: vi.fn((uri: unknown, ...segments: string[]) => {
      const u = uri as Record<string, unknown>;
      return {
        ...u,
        toString: () => [String(uri), ...segments].join('/'),
      };
    }),
  },
  DiagnosticSeverity: {
    Error: 1,
    Warning: 2,
    Information: 3,
    Hint: 4,
  },
  StatusBarAlignment: {
    Left: 0,
    Right: 1,
  },
  CodeActionKind: {
    QuickFix: { value: 'quickfix' },
  },
  languages: {
    registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  Terminal: {
    Integrated: {
      shellArgs: {},
    },
  },
  EventEmitter: vi.fn().mockImplementation(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
};

export default mockVscode;
export const vscode = mockVscode;
