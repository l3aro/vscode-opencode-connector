import { DebugContext, StackFrameInfo, VariableInfo } from '../types';

import * as vscode from 'vscode';

export async function getDebugContext(): Promise<DebugContext | null> {
  const session = vscode.debug.activeDebugSession;
  if (!session) {
    return null;
  }

  try {
    await session.customRequest('stackTrace');
  } catch {
    return null;
  }

  const stackFrames: StackFrameInfo[] = [];
  const variables: VariableInfo[] = [];

  try {
    const stackTraceResponse = await session.customRequest('stackTrace');
    const frames = stackTraceResponse?.body?.stackFrames || [];

    for (const sf of frames) {
      stackFrames.push({
        name: sf.name || '<anonymous>',
        source: sf.source?.path || sf.source?.name,
        line: sf.line,
        column: sf.column,
      });
    }

    if (frames.length > 0) {
      const firstFrame = frames[0];
      const scopesResponse = await session.customRequest('scopes', {
        frameId: firstFrame.id,
      });

      const scopes = scopesResponse?.body?.scopes || [];
      if (scopes.length > 0) {
        const varsResponse = await session.customRequest('variables', {
          variablesReference: scopes[0].variablesReference,
        });

        const vars = varsResponse?.body?.variables || [];
        for (const v of vars) {
          variables.push({
            name: v.name,
            value: String(v.value),
            type: v.type || typeof v.value,
          });
        }
      }
    }
  } catch {
    // Silently return partial results
  }

  return { stackFrames, variables };
}

export default getDebugContext;
