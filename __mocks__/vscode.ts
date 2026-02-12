/**
 * Mock vscode module for testing workspace utilities
 */
import { vi } from 'vitest';

const mockVscode = {
  workspace: {
    workspaceFolders: undefined,
    name: undefined,
    asRelativePath: vi.fn((uri: any) => {
      // Default implementation
      return uri.fsPath || uri.path || '';
    }),
  },
  Uri: {
    parse: vi.fn((str: string) => ({
      fsPath: str,
      toString: () => str,
    })),
    joinPath: vi.fn((uri: any, ...segments: string[]) => ({
      ...uri,
      toString: () => [uri.toString(), ...segments].join('/'),
    })),
  },
  DiagnosticSeverity: {
    Error: 1,
    Warning: 2,
    Information: 3,
    Hint: 4,
  },
};

export default mockVscode;
export const vscode = mockVscode;
