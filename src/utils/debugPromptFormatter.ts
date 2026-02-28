import { DebugContext, StackFrameInfo, VariableInfo } from '../types';

const MAX_STACK_FRAMES = 10;
const MAX_VARIABLE_DEPTH = 3;
const MAX_VALUE_LENGTH = 500;

function truncateValue(value: string, maxLength: number): string {
  if (value == null) {
    return String(value);
  }
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength - 3) + '...';
}

function formatVariable(name: string, value: unknown, depth: number): string {
  if (depth > MAX_VARIABLE_DEPTH) {
    return `${name} = [max depth reached]`;
  }

  if (value == null) {
    return `${name} = ${value}`;
  }

  const strValue = String(value);
  return `${name} = ${truncateValue(strValue, MAX_VALUE_LENGTH)}`;
}

export function formatDebugContext(context: DebugContext): string {
  const stackFrameLines = context.stackFrames
    .slice(0, MAX_STACK_FRAMES)
    .map((frame: StackFrameInfo) => {
      const source = frame.source || 'unknown';
      const line = frame.line || 1;
      const name = frame.name || 'anonymous';
      return `@${source}#L${line} in ${name}`;
    });

  const variableLines = context.variables.map((v: VariableInfo) => {
    return formatVariable(v.name, v.value, 0);
  });

  const stackSection =
    stackFrameLines.length > 0
      ? `Stack trace:\n${stackFrameLines.join('\n')}`
      : 'No stack frames available';

  const variableSection =
    variableLines.length > 0 ? `Variables:\n${variableLines.join('\n')}` : 'No variables available';

  return `Debug this for me:\n${stackSection}\n\n${variableSection}`;
}

export default formatDebugContext;
