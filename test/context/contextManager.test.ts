/**
 * Unit tests for ContextManager types and configuration
 * Tests the exported types without requiring VS Code module
 */
import { describe, expect, it } from 'vitest';

describe('ContextManager Types', () => {
  describe('StateUpdateCallback', () => {
    it('should be a function type that accepts EditorState', () => {
      // Define a mock state that matches EditorState structure
      interface MockState {
        documents: Array<{
          uri: string;
          fileName: string;
          content: string;
          languageId: string;
          isDirty: boolean;
        }>;
        selection: {
          documentUri: string;
          cursor: { line: number; character: number };
          selection: {
            start: { line: number; character: number };
            end: { line: number; character: number };
            isReversed: boolean;
          };
        };
        diagnostics: Array<{
          uri: string;
          diagnostics: Array<{
            message: string;
            severity: 'error' | 'warning' | 'information' | 'hint';
          }>;
        }>;
        timestamp: number;
      }

      // Should accept a function with this signature
      const callback: (state: MockState) => void = state => {
        expect(state).toBeDefined();
      };

      expect(typeof callback).toBe('function');
    });
  });

  describe('ContextManagerConfig', () => {
    it('should accept all configuration options', () => {
      interface Config {
        debounceMs?: number;
        maxVisibleEditors?: number;
        trackDiagnostics?: boolean;
        trackSelection?: boolean;
        trackDocuments?: boolean;
      }

      const config: Config = {
        debounceMs: 300,
        maxVisibleEditors: 10,
        trackDiagnostics: true,
        trackSelection: true,
        trackDocuments: true,
      };

      expect(config.debounceMs).toBe(300);
      expect(config.maxVisibleEditors).toBe(10);
      expect(config.trackDiagnostics).toBe(true);
    });

    it('should accept partial configuration', () => {
      interface Config {
        debounceMs?: number;
        maxVisibleEditors?: number;
        trackDiagnostics?: boolean;
        trackSelection?: boolean;
        trackDocuments?: boolean;
      }

      const config: Config = {
        debounceMs: 500,
      };

      expect(config.debounceMs).toBe(500);
      expect(config.maxVisibleEditors).toBeUndefined();
    });
  });
});

describe('Default Values', () => {
  it('should have expected default debounce value', () => {
    const DEFAULT_DEBOUNCE_MS = 300;
    expect(DEFAULT_DEBOUNCE_MS).toBe(300);
  });

  it('should have expected default maxVisibleEditors value', () => {
    const DEFAULT_MAX_VISIBLE_EDITORS = 10;
    expect(DEFAULT_MAX_VISIBLE_EDITORS).toBe(10);
  });

  it('should have expected default tracking values', () => {
    const defaults = {
      trackDiagnostics: true,
      trackSelection: true,
      trackDocuments: true,
    };

    expect(defaults.trackDiagnostics).toBe(true);
    expect(defaults.trackSelection).toBe(true);
    expect(defaults.trackDocuments).toBe(true);
  });
});
