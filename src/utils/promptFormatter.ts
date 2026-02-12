/**
 * Utility for formatting the "Explain and Fix" prompt message.
 */

/**
 * Minimal diagnostic interface for testing without VS Code module
 */
export interface DiagnosticInfo {
  message: string;
  severity: number;
  range: {
    start: {
      line: number;
      character: number;
    };
    end: {
      line: number;
      character: number;
    };
  };
  code?: string | number;
}

/**
 * Minimal URI interface for testing without VS Code module
 */
export interface UriInfo {
  fsPath: string;
  path: string;
  scheme: string;
}

/**
 * Format the prompt message for the Explain and Fix code action.
 * @param diagnostic - The diagnostic containing the error/warning info
 * @param uri - The URI of the file containing the diagnostic
 * @param getRelativePath - Function to get relative path (defaults to using workspace.asRelativePath)
 * @returns Formatted prompt string ready for OpenCode TUI
 */
export function formatExplainAndFixPrompt(
  diagnostic: DiagnosticInfo,
  uri: UriInfo,
  getRelativePath: (uri: UriInfo) => string = defaultGetRelativePath
): string {
  // Get the relative path for the file reference
  const relativePath = getRelativePath(uri);

  // Get the line number (1-based for user display)
  const lineNumber = diagnostic.range.start.line + 1;

  // Build the error code suffix if available
  let codeSuffix = '';
  if (diagnostic.code) {
    const codeValue =
      typeof diagnostic.code === 'string' ? diagnostic.code : String(diagnostic.code);
    codeSuffix = ` [${codeValue}]`;
  }

  // Format: "Explain what this problem is and help me fix it: {message} @{path}#L{line}"
  return `Explain what this problem is and help me fix it: ${diagnostic.message}${codeSuffix} @${relativePath}#L${lineNumber}`;
}

/**
 * Default implementation of getRelativePath using VS Code workspace API
 */
function defaultGetRelativePath(uri: UriInfo): string {
  // Dynamic import to avoid issues in test environment
  return uri.fsPath || uri.path || '';
}

export default formatExplainAndFixPrompt;
