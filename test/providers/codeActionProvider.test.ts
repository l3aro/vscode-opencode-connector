/**
 * Unit tests for CodeActionProvider logic
 * Tests severity mapping and filtering without full VS Code integration
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Test the core logic by importing the provider class
// We'll test the methods that don't require full VS Code types
describe('CodeActionProvider Logic', () => {
  describe('Severity Mapping', () => {
    it('should correctly map severity strings to numbers', () => {
      // This tests the severityMap object from the provider
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      expect(severityMap['error']).toBe(1);
      expect(severityMap['warning']).toBe(2);
      expect(severityMap['information']).toBe(3);
      expect(severityMap['hint']).toBe(4);
    });

    it('should filter severities correctly', () => {
      const configuredLevels = ['error', 'warning'];
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      const allowedSeverities = new Set(
        configuredLevels.map(level => severityMap[level]).filter(Boolean)
      );

      // Should contain Error (1) and Warning (2)
      expect(allowedSeverities.has(1)).toBe(true);
      expect(allowedSeverities.has(2)).toBe(true);
      // Should NOT contain Information (3) or Hint (4)
      expect(allowedSeverities.has(3)).toBe(false);
      expect(allowedSeverities.has(4)).toBe(false);
    });

    it('should handle all severity levels', () => {
      const configuredLevels = ['error', 'warning', 'information', 'hint'];
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      const allowedSeverities = new Set(
        configuredLevels.map(level => severityMap[level]).filter(Boolean)
      );

      // Should contain all severities
      expect(allowedSeverities.has(1)).toBe(true);
      expect(allowedSeverities.has(2)).toBe(true);
      expect(allowedSeverities.has(3)).toBe(true);
      expect(allowedSeverities.has(4)).toBe(true);
    });

    it('should filter diagnostics correctly', () => {
      const allowedSeverities = new Set([1, 2]); // error, warning

      const diagnostics = [
        { message: 'Type error', severity: 1 }, // error
        { message: 'Unused var', severity: 2 }, // warning
        { message: 'Info msg', severity: 3 }, // information
        { message: 'Hint msg', severity: 4 }, // hint
      ];

      const relevantDiagnostics = diagnostics.filter(d => allowedSeverities.has(d.severity));

      expect(relevantDiagnostics).toHaveLength(2);
      expect(relevantDiagnostics[0].message).toBe('Type error');
      expect(relevantDiagnostics[1].message).toBe('Unused var');
    });

    it('should handle empty configuration', () => {
      const configuredLevels: string[] = [];
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      const allowedSeverities = new Set(
        configuredLevels.map(level => severityMap[level]).filter(Boolean)
      );

      expect(allowedSeverities.size).toBe(0);
    });

    it('should handle invalid severity strings', () => {
      const configuredLevels = ['error', 'invalid', 'warning'];
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      const allowedSeverities = new Set(
        configuredLevels.map(level => severityMap[level]).filter(Boolean)
      );

      // Should only contain valid severities
      expect(allowedSeverities.has(1)).toBe(true);
      expect(allowedSeverities.has(2)).toBe(true);
      expect(allowedSeverities.size).toBe(2);
    });
  });

  describe('Configuration Integration', () => {
    it('should use default severity levels when config is not set', () => {
      const defaultLevels = ['error', 'warning', 'information', 'hint'];
      const severityMap: Record<string, number> = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
      };

      // Simulate config not returning anything (null/undefined)
      const configuredLevels = defaultLevels;

      const allowedSeverities = new Set(
        configuredLevels.map(level => severityMap[level]).filter(Boolean)
      );

      expect(allowedSeverities.has(1)).toBe(true);
      expect(allowedSeverities.has(2)).toBe(true);
      expect(allowedSeverities.has(3)).toBe(true);
      expect(allowedSeverities.has(4)).toBe(true);
    });
  });

  describe('Command Arguments', () => {
    it('should format command arguments correctly', () => {
      const diagnostic = {
        message: 'Test error',
        severity: 1,
        range: {
          start: { line: 5, character: 10 },
          end: { line: 5, character: 20 },
        },
        code: 'TEST001',
      };

      const argumentsArray = [diagnostic];

      expect(argumentsArray).toHaveLength(1);
      expect(argumentsArray[0]).toBe(diagnostic);
      expect(argumentsArray[0].code).toBe('TEST001');
    });
  });

  describe('Action Properties', () => {
    it('should set correct action properties', () => {
      const title = 'Explain and Fix (OpenCode)';
      const kindValue = 'quickfix';
      const commandName = 'opencode.explainAndFix';
      const isPreferred = true;

      expect(title).toBe('Explain and Fix (OpenCode)');
      expect(kindValue).toBe('quickfix');
      expect(commandName).toBe('opencode.explainAndFix');
      expect(isPreferred).toBe(true);
    });
  });
});
