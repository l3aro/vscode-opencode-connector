/**
 * Mock vscode module for testing workspace utilities
 */
import { vi } from 'vitest';

const mockVscode = {
  workspace: {
    workspaceFolders: undefined,
    name: undefined,
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
};

export default mockVscode;
export const vscode = mockVscode;
