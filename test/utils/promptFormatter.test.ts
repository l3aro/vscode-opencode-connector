/**
 * Unit tests for prompt formatter utility
 * Tests the exported format function without requiring VS Code module
 */
import {
  DiagnosticInfo,
  UriInfo,
  formatExplainAndFixPrompt,
} from '../../src/utils/promptFormatter';

import { describe, expect, it } from 'vitest';

describe('promptFormatter', () => {
  describe('formatExplainAndFixPrompt', () => {
    it('should format prompt with error message and file reference', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Type "string" is not assignable to type "number"',
        severity: 1, // Error
        range: {
          start: { line: 10, character: 5 },
          end: { line: 10, character: 20 },
        },
        code: 'TS2322',
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/main.ts',
        path: '/workspace/my-project/src/main.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/main.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toBe(
        'Explain what this problem is and help me fix it: Type "string" is not assignable to type "number" [TS2322] @src/main.ts#L11'
      );
    });

    it('should format prompt with Windows path', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Cannot find name "console"',
        severity: 2, // Warning
        range: {
          start: { line: 5, character: 1 },
          end: { line: 5, character: 8 },
        },
        code: 'TS2304',
      };

      const uri: UriInfo = {
        fsPath: 'C:\\Projects\\my-project\\src\\utils.ts',
        path: 'C:\\Projects\\my-project\\src\\utils.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/utils.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toBe(
        'Explain what this problem is and help me fix it: Cannot find name "console" [TS2304] @src/utils.ts#L6'
      );
    });

    it('should include error code in brackets if available', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Variable "x" is used before being assigned',
        severity: 1, // Error
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        code: 'TS2448',
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/app.ts',
        path: '/workspace/my-project/src/app.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/app.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('[TS2448]');
      expect(result).toContain('@src/app.ts#L1');
    });

    it('should handle diagnostic without code', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Unexpected console statement',
        severity: 2, // Warning
        range: {
          start: { line: 20, character: 2 },
          end: { line: 20, character: 15 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/script.js',
        path: '/workspace/my-project/src/script.js',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/script.js';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toBe(
        'Explain what this problem is and help me fix it: Unexpected console statement @src/script.js#L21'
      );
    });

    it('should handle different diagnostic severities', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'This is an information message',
        severity: 3, // Information
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/info.ts',
        path: '/workspace/my-project/src/info.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/info.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('information message');
      expect(result).toContain('@src/info.ts#L2');
    });

    it('should handle hint severity', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Consider using const instead of let',
        severity: 4, // Hint
        range: {
          start: { line: 3, character: 0 },
          end: { line: 3, character: 10 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/hint.ts',
        path: '/workspace/my-project/src/hint.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/hint.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('Consider using const instead of let');
      expect(result).toContain('@src/hint.ts#L4');
    });

    it('should handle messages with special characters', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Error: Unexpected token `}` in JSON at position 42',
        severity: 1, // Error
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/config.json',
        path: '/workspace/my-project/src/config.json',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/config.json';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('Unexpected token `}` in JSON at position 42');
      expect(result).toContain('@src/config.json#L1');
    });

    it('should handle deeply nested paths', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Property "prop" is missing in type',
        severity: 1, // Error
        range: {
          start: { line: 5, character: 10 },
          end: { line: 5, character: 20 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/components/ui/buttons/submitButton.tsx',
        path: '/workspace/my-project/src/components/ui/buttons/submitButton.tsx',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/components/ui/buttons/submitButton.tsx';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('src/components/ui/buttons/submitButton.tsx');
      expect(result).toContain('#L6');
    });

    it('should handle numeric error code', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Some error occurred',
        severity: 1, // Error
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
        code: 1005, // Numeric code
      };

      const uri: UriInfo = {
        fsPath: '/workspace/my-project/src/numeric.ts',
        path: '/workspace/my-project/src/numeric.ts',
        scheme: 'file',
      };

      const getRelativePath = (u: UriInfo) => 'src/numeric.ts';

      const result = formatExplainAndFixPrompt(diagnostic, uri, getRelativePath);

      expect(result).toContain('[1005]');
    });

    it('should use default getRelativePath when not provided', () => {
      const diagnostic: DiagnosticInfo = {
        message: 'Test error',
        severity: 1,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      };

      const uri: UriInfo = {
        fsPath: '/test/file.ts',
        path: '/test/file.ts',
        scheme: 'file',
      };

      const result = formatExplainAndFixPrompt(diagnostic, uri);

      // Default returns fsPath
      expect(result).toContain('@/test/file.ts#L1');
    });
  });
});
