/**
 * CodeActionProvider for the "Explain and Fix" feature.
 * Provides quick fix actions that send diagnostic information to OpenCode.
 */
import { ConfigManager } from '../config';
import { DiagnosticInfo, UriInfo, formatExplainAndFixPrompt } from '../utils/promptFormatter';

import * as vscode from 'vscode';

/**
 * Severity mapping from string to vscode.DiagnosticSeverity enum
 */
const severityMap: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

/**
 * OpenCode Code Action Provider
 * Provides "Explain and Fix" quick fix actions for diagnostics.
 */
export class OpenCodeCodeActionProvider implements vscode.CodeActionProvider {
  /**
   * Provide code actions for the given document and range.
   * Filters diagnostics based on configured severity levels.
   */
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    void _token; // Satisfy interface requirement

    // Get configured severity levels from settings
    const configManager = ConfigManager.getInstance();
    const configuredLevels = configManager.getCodeActionSeverityLevels();

    // Convert configured strings to DiagnosticSeverity enums
    const allowedSeverities = new Set(
      configuredLevels.map(level => severityMap[level]).filter(Boolean)
    );

    // Filter diagnostics to only include those matching allowed severities
    const relevantDiagnostics = context.diagnostics.filter(diagnostic =>
      allowedSeverities.has(diagnostic.severity)
    );

    if (relevantDiagnostics.length === 0) {
      return [];
    }

    // Create code actions for each relevant diagnostic
    return relevantDiagnostics.map(diagnostic => {
      const action = new vscode.CodeAction(
        'Explain and Fix (OpenCode)',
        vscode.CodeActionKind.QuickFix
      );

      // Set the command to execute
      action.command = {
        title: 'Explain and Fix (OpenCode)',
        command: 'opencode.explainAndFix',
        arguments: [diagnostic, document.uri],
      };

      // Make the action preferred (appears at top of quick fix menu)
      action.isPreferred = true;

      return action;
    });
  }
}

/**
 * Create a DiagnosticInfo from a VS Code Diagnostic
 */
function createDiagnosticInfo(diagnostic: vscode.Diagnostic): DiagnosticInfo {
  return {
    message: diagnostic.message,
    severity: diagnostic.severity,
    range: {
      start: {
        line: diagnostic.range.start.line,
        character: diagnostic.range.start.character,
      },
      end: {
        line: diagnostic.range.end.line,
        character: diagnostic.range.end.character,
      },
    },
    code:
      typeof diagnostic.code === 'string'
        ? diagnostic.code
        : typeof diagnostic.code === 'number'
          ? String(diagnostic.code)
          : (diagnostic.code?.value?.toString() ?? undefined),
  };
}

/**
 * Create a UriInfo from a VS Code Uri
 */
function createUriInfo(uri: vscode.Uri): UriInfo {
  return {
    fsPath: uri.fsPath,
    path: uri.path,
    scheme: uri.scheme,
  };
}

/**
 * Format the prompt for a diagnostic (exported for testing)
 */
export function formatPromptForDiagnostic(
  diagnostic: vscode.Diagnostic,
  uri: vscode.Uri,
  getRelativePath?: (uri: UriInfo) => string
): string {
  const diagInfo = createDiagnosticInfo(diagnostic);
  const uriInfo = createUriInfo(uri);
  return formatExplainAndFixPrompt(diagInfo, uriInfo, getRelativePath);
}

export default OpenCodeCodeActionProvider;
