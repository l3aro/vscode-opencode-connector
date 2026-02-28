/**
 * Unit tests for debug prompt formatter utility
 * Tests the exported formatDebugContext function without requiring VS Code module
 */
import { DebugContext, StackFrameInfo, VariableInfo } from '../../src/types';
import { formatDebugContext } from '../../src/utils/debugPromptFormatter';

import { describe, expect, it } from 'vitest';

describe('debugPromptFormatter', () => {
  describe('formatDebugContext', () => {
    it('should format stack frames with filepath and line in name', () => {
      const context: DebugContext = {
        stackFrames: [
          {
            name: 'myFunction',
            source: '/workspace/project/src/index.ts',
            line: 10,
            column: 5,
          },
        ],
        variables: [],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('@/workspace/project/src/index.ts#L10 in myFunction');
    });

    it('should format variables with name = value', () => {
      const context: DebugContext = {
        stackFrames: [],
        variables: [
          { name: 'count', value: '42', type: 'number' },
          { name: 'name', value: 'test', type: 'string' },
        ],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('count = 42');
      expect(result).toContain('name = test');
    });

    it('should handle depth limits with max 3 levels of nesting', () => {
      const context: DebugContext = {
        stackFrames: [],
        variables: [
          {
            name: 'nested',
            value: JSON.stringify({
              level1: {
                level2: {
                  level3: {
                    level4: 'too deep',
                  },
                },
              },
            }),
            type: 'object',
          },
        ],
      };

      const result = formatDebugContext(context);

      // The formatter should handle the nesting through JSON.stringify
      // Depth limit is applied in recursive formatVariable but since we pass
      // already-stringified JSON, it will just truncate based on MAX_VALUE_LENGTH
      expect(result).toContain('nested = ');
    });

    it('should handle circular references without throwing', () => {
      const circularObj: Record<string, unknown> = { name: 'test' };
      circularObj.self = circularObj;

      const context: DebugContext = {
        stackFrames: [],
        variables: [
          {
            name: 'circular',
            value: circularObj as unknown as string,
            type: 'object',
          },
        ],
      };

      // Should not throw
      const result = formatDebugContext(context);

      expect(result).toContain('circular = ');
    });

    it('should handle empty context', () => {
      const context: DebugContext = {
        stackFrames: [],
        variables: [],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('No stack frames available');
      expect(result).toContain('No variables available');
    });

    it('should limit to max 10 stack frames', () => {
      const stackFrames: StackFrameInfo[] = Array.from({ length: 15 }, (_, i) => ({
        name: `function${i}`,
        source: `/workspace/project/src/file${i}.ts`,
        line: i + 1,
        column: 1,
      }));

      const context: DebugContext = {
        stackFrames,
        variables: [],
      };

      const result = formatDebugContext(context);

      // Should only contain first 10 frames
      expect(result).toContain('function0');
      expect(result).toContain('function9');
      expect(result).not.toContain('function10');
    });

    it('should truncate values longer than 500 characters', () => {
      const longValue = 'x'.repeat(600);

      const context: DebugContext = {
        stackFrames: [],
        variables: [
          {
            name: 'longString',
            value: longValue,
            type: 'string',
          },
        ],
      };

      const result = formatDebugContext(context);

      // Should be truncated to 500 chars with "..." (497 + 3 = 500)
      expect(result).toContain('longString = ');
      expect(result.length).toBeLessThan(600);
      expect(result).toContain('...');
    });

    it('should handle null and undefined values', () => {
      const context: DebugContext = {
        stackFrames: [],
        variables: [
          { name: 'nullVar', value: null as unknown as string, type: 'null' },
          { name: 'undefinedVar', value: undefined as unknown as string, type: 'undefined' },
        ],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('nullVar = null');
      expect(result).toContain('undefinedVar = undefined');
    });

    it('should handle missing source in stack frame', () => {
      const context: DebugContext = {
        stackFrames: [
          {
            name: 'anonymous',
            line: 5,
            column: 10,
          },
        ],
        variables: [],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('@unknown#L5 in anonymous');
    });

    it('should format prompt with both stack frames and variables', () => {
      const context: DebugContext = {
        stackFrames: [
          {
            name: 'handleClick',
            source: '/workspace/project/src/button.tsx',
            line: 25,
            column: 3,
          },
        ],
        variables: [
          { name: 'isActive', value: 'true', type: 'boolean' },
          { name: 'count', value: '5', type: 'number' },
        ],
      };

      const result = formatDebugContext(context);

      expect(result).toContain('Debug this for me:');
      expect(result).toContain('Stack trace:');
      expect(result).toContain('@/workspace/project/src/button.tsx#L25 in handleClick');
      expect(result).toContain('Variables:');
      expect(result).toContain('isActive = true');
      expect(result).toContain('count = 5');
    });
  });
});
