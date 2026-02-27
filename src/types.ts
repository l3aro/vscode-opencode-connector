/**
 * Type definitions for OpenCode Connector
 */

/**
 * Represents the state of the text editor including document content and cursor/selection.
 */
export interface EditorDocumentState {
  /** Unique URI identifying the document */
  uri: string;
  /** The file name or document title */
  fileName: string;
  /** The full text content of the document */
  content: string;
  /** The programming language ID (e.g., 'typescript', 'python') */
  languageId: string;
  /** Whether the document has unsaved changes */
  isDirty: boolean;
  /** When the document was last modified */
  modifiedTime?: number;
}

/**
 * Represents the cursor position in a document.
 */
export interface CursorPosition {
  /** Zero-based line number */
  line: number;
  /** Zero-based character position on the line */
  character: number;
}

/**
 * Represents a text selection range.
 */
export interface SelectionRange {
  /** The start position of the selection */
  start: CursorPosition;
  /** The end position of the selection */
  end: CursorPosition;
  /** Whether this is a reverse selection (anchor after active) */
  isReversed: boolean;
}

/**
 * Represents the active editor state including cursor and selection.
 */
export interface EditorSelectionState {
  /** The document this selection belongs to */
  documentUri: string;
  /** The primary cursor position */
  cursor: CursorPosition;
  /** The selection range (may be same as cursor if no selection) */
  selection: SelectionRange;
}

/**
 * Represents a diagnostic (error, warning, hint) in a document.
 */
export interface DiagnosticInfo {
  /** The diagnostic message */
  message: string;
  /** Severity level: error, warning, information, hint */
  severity: 'error' | 'warning' | 'information' | 'hint';
  /** Source of the diagnostic (e.g., 'typescript', 'eslint') */
  source?: string;
  /** The line number where this diagnostic occurs (1-based) */
  line: number;
  /** The character position on the line (0-based) */
  column: number;
  /** The code related to this diagnostic, if any */
  code?: string | number;
}

/**
 * Diagnostic summary for a document.
 */
export interface DocumentDiagnostics {
  /** The URI of the document this diagnostic belongs to */
  uri: string;
  /** Array of diagnostics */
  diagnostics: DiagnosticInfo[];
}

/**
 * Complete editor state to be sent to OpenCode context endpoint.
 */
export interface EditorState {
  /** List of open documents */
  documents: EditorDocumentState[];
  /** The currently active editor */
  activeDocument?: EditorDocumentState;
  /** Current cursor and selection state */
  selection: EditorSelectionState;
  /** Aggregated diagnostics for all open documents */
  diagnostics: DocumentDiagnostics[];
  /** Workspace root URI (if available) */
  workspaceRoot?: string;
  /** Timestamp of when this state was captured */
  timestamp: number;
}

/** GET /global/health response */
export interface HealthResponse {
  healthy: true;
  version: string;
}

/** GET /path response */
export interface PathResponse {
  home: string;
  state: string;
  config: string;
  worktree: string;
  directory: string;
}

/** Session time info */
export interface SessionTime {
  created: number;
  updated: number;
  archived?: number;
}

/** GET /session response item */
export interface SessionInfo {
  id: string;
  title: string;
  directory: string;
  parentID?: string;
  time: SessionTime;
  share?: string;
}

/** GET /agent response item */
export interface AgentInfo {
  name: string;
  description: string;
  mode: 'primary' | 'subagent';
}

/** GET /command response item */
export interface CommandInfo {
  name: string;
  description: string;
  template: string;
  agent: string;
}

/** SSE event from GET /event */
export interface SSEEvent {
  type: string;
  properties: Record<string, unknown>;
}

/** POST /session/:id/message request body */
export interface MessageInput {
  providerID: string;
  modelID: string;
  parts: MessagePart[];
}

/** Message part */
export interface MessagePart {
  type: 'text';
  id: string;
  text: string;
}

/** TUI event for POST /tui/publish */
export interface TuiPublishEvent {
  type: string;
  properties: Record<string, unknown>;
}

/** GET /vcs response */
export interface VcsInfo {
  branch: string;
}

/**
 * Represents a stack frame in a debug session.
 */
export interface StackFrameInfo {
  /** The name of the stack frame (function/method name) */
  name: string;
  /** The source file path or URI */
  source?: string;
  /** The line number in the source file (1-based) */
  line: number;
  /** The column number on the line (0-based) */
  column: number;
}

/**
 * Represents a variable in a debug context.
 */
export interface VariableInfo {
  /** The variable name */
  name: string;
  /** The variable value as a string */
  value: string;
  /** The type of the variable (e.g., 'string', 'number', 'object') */
  type: string;
}

/**
 * Represents the current debug state including active stack frames and variables.
 */
export interface DebugContext {
  /** The active stack frames in the current debug session */
  stackFrames: StackFrameInfo[];
  /** The current variables in scope */
  variables: VariableInfo[];
}

/**
 * Represents a debug session.
 */
export interface DebugSessionInfo {
  /** The unique identifier of the debug session */
  id: string;
  /** The name of the debug session */
  name: string;
  /** The type of debug adapter (e.g., 'node', 'python') */
  type: string;
  /** The current workspace folder URI */
  workspaceFolder?: string;
}
