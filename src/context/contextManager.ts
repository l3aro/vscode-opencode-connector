/**
 * Context Manager - Aggregates editor state and sends to OpenCode
 * Subscribes to VS Code events and debounces state updates
 */
import {
  DiagnosticInfo,
  DocumentDiagnostics,
  EditorDocumentState,
  EditorSelectionState,
  EditorState,
} from '../types';
import { cancelDebounce, debounce } from '../utils/debounce';

import * as vscode from 'vscode';

/**
 * Configuration options for ContextManager
 */
export interface ContextManagerConfig {
  /** Debounce delay in milliseconds (default: 300) */
  debounceMs?: number;
  /** Maximum number of visible editors to track (default: 10) */
  maxVisibleEditors?: number;
  /** Whether to track diagnostics (default: true) */
  trackDiagnostics?: boolean;
  /** Whether to track selection changes (default: true) */
  trackSelection?: boolean;
  /** Whether to track document changes (default: true) */
  trackDocuments?: boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<ContextManagerConfig> = {
  debounceMs: 300,
  maxVisibleEditors: 10,
  trackDiagnostics: true,
  trackSelection: true,
  trackDocuments: true,
};

/**
 * Callback type for state updates
 */
export type StateUpdateCallback = (state: EditorState) => void;

/**
 * Context Manager - Aggregates editor state and sends to OpenCode
 *
 * Responsibilities:
 * - Subscribe to VS Code events (text changes, selections, diagnostics)
 * - Debounce state updates to avoid flooding
 * - Only track visible editors for performance
 * - Provide cleanup on extension deactivation
 */
export class ContextManager {
  private config: Required<ContextManagerConfig>;
  private subscriptions: vscode.Disposable[] = [];
  private stateUpdateCallback: StateUpdateCallback | null = null;
  private debouncedUpdate: (() => void) | null = null;
  private visibleEditors: Map<string, vscode.TextEditor> = new Map();
  private currentState: EditorState | null = null;

  /**
   * Create a new ContextManager
   * @param config - Optional configuration overrides
   */
  constructor(config: ContextManagerConfig = {}) {
    this.config = {
      debounceMs: config.debounceMs ?? DEFAULT_CONFIG.debounceMs,
      maxVisibleEditors: config.maxVisibleEditors ?? DEFAULT_CONFIG.maxVisibleEditors,
      trackDiagnostics: config.trackDiagnostics ?? DEFAULT_CONFIG.trackDiagnostics,
      trackSelection: config.trackSelection ?? DEFAULT_CONFIG.trackSelection,
      trackDocuments: config.trackDocuments ?? DEFAULT_CONFIG.trackDocuments,
    };

    // Create debounced update function
    this.debouncedUpdate = debounce(() => this.collectAndSendState(), this.config.debounceMs);
  }

  /**
   * Initialize the context manager and start listening to events
   * @param onStateUpdate - Callback to receive state updates
   */
  public initialize(onStateUpdate: StateUpdateCallback): void {
    this.stateUpdateCallback = onStateUpdate;

    // Register event subscriptions
    this.registerEventSubscriptions();

    // Initial state collection
    this.collectAndSendState();
  }

  /**
   * Register VS Code event subscriptions
   */
  private registerEventSubscriptions(): void {
    // Text document change events
    if (this.config.trackDocuments) {
      const textDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
        event => this.handleTextDocumentChange(event),
        this
      );
      this.subscriptions.push(textDocumentSubscription);
    }

    // Text editor selection change events
    if (this.config.trackSelection) {
      const textEditorSelectionSubscription = vscode.window.onDidChangeTextEditorSelection(
        event => this.handleTextEditorSelectionChange(event),
        this
      );
      this.subscriptions.push(textEditorSelectionSubscription);
    }

    // Active editor change events
    const activeEditorSubscription = vscode.window.onDidChangeActiveTextEditor(
      editor => this.handleActiveEditorChange(editor),
      this
    );
    this.subscriptions.push(activeEditorSubscription);

    // Visible editors change events
    const visibleEditorsSubscription = vscode.window.onDidChangeVisibleTextEditors(
      editors => this.handleVisibleEditorsChange(editors),
      this
    );
    this.subscriptions.push(visibleEditorsSubscription);

    // Diagnostic change events
    if (this.config.trackDiagnostics) {
      const diagnosticSubscription = vscode.languages.onDidChangeDiagnostics(
        event => this.handleDiagnosticsChange(event),
        this
      );
      this.subscriptions.push(diagnosticSubscription);
    }

    // Window state change (e.g., when VS Code gains focus)
    const windowStateSubscription = vscode.window.onDidChangeWindowState(state => {
      if (state.focused) {
        this.triggerUpdate();
      }
    }, this);
    this.subscriptions.push(windowStateSubscription);
  }

  /**
   * Handle text document changes
   */
  private handleTextDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    // Only track visible editors
    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === event.document.uri.toString()
    );

    if (editor) {
      this.visibleEditors.set(event.document.uri.toString(), editor);
      this.triggerUpdate();
    }
  }

  /**
   * Handle text editor selection changes
   */
  private handleTextEditorSelectionChange(event: vscode.TextEditorSelectionChangeEvent): void {
    // Only track visible editors
    if (this.visibleEditors.has(event.textEditor.document.uri.toString())) {
      this.triggerUpdate();
    }
  }

  /**
   * Handle active editor changes
   */
  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    if (editor) {
      this.visibleEditors.set(editor.document.uri.toString(), editor);
    }
    this.triggerUpdate();
  }

  /**
   * Handle visible editors changes
   */
  private handleVisibleEditorsChange(editors: readonly vscode.TextEditor[]): void {
    // Update the visible editors map
    this.visibleEditors.clear();

    // Limit to max visible editors for performance
    let count = 0;
    for (const editor of editors) {
      if (count >= this.config.maxVisibleEditors) {
        break;
      }
      this.visibleEditors.set(editor.document.uri.toString(), editor);
      count++;
    }

    this.triggerUpdate();
  }

  /**
   * Handle diagnostics changes
   */
  private handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent): void {
    // Only trigger update if diagnostics changed for visible documents
    const hasVisibleDiagnostics = event.uris.some(uri => this.visibleEditors.has(uri.toString()));

    if (hasVisibleDiagnostics) {
      this.triggerUpdate();
    }
  }

  /**
   * Trigger a debounced state update
   */
  private triggerUpdate(): void {
    if (this.debouncedUpdate) {
      this.debouncedUpdate();
    }
  }

  /**
   * Collect current state and send to callback
   */
  private collectAndSendState(): void {
    const state = this.collectState();
    this.currentState = state;

    if (this.stateUpdateCallback) {
      this.stateUpdateCallback(state);
    }
  }

  /**
   * Collect the current editor state
   * @returns The current EditorState
   */
  public collectState(): EditorState {
    const documents: EditorDocumentState[] = [];
    let activeDocument: EditorDocumentState | undefined;

    // Collect state from visible editors
    for (const editor of this.visibleEditors.values()) {
      const docState = this.extractDocumentState(editor);
      documents.push(docState);

      if (editor === vscode.window.activeTextEditor) {
        activeDocument = docState;
      }
    }

    // Get selection state from active editor
    const selection = this.extractSelectionState();

    // Get diagnostics
    const diagnostics = this.extractDiagnostics();

    // Get workspace root
    const workspaceRoot = this.getWorkspaceRoot();

    return {
      documents,
      activeDocument,
      selection,
      diagnostics,
      workspaceRoot,
      timestamp: Date.now(),
    };
  }

  /**
   * Extract document state from a text editor
   */
  private extractDocumentState(editor: vscode.TextEditor): EditorDocumentState {
    const document = editor.document;

    return {
      uri: document.uri.toString(),
      fileName: document.fileName,
      content: document.getText(),
      languageId: document.languageId,
      isDirty: document.isDirty,
      modifiedTime: document.isDirty ? Date.now() : undefined,
    };
  }

  /**
   * Extract selection state from active editor
   */
  private extractSelectionState(): EditorSelectionState {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor || !this.visibleEditors.has(activeEditor.document.uri.toString())) {
      // Return empty selection state
      return {
        documentUri: '',
        cursor: { line: 0, character: 0 },
        selection: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
          isReversed: false,
        },
      };
    }

    const document = activeEditor.document;
    const selection = activeEditor.selection;
    const cursor = selection.active;

    return {
      documentUri: document.uri.toString(),
      cursor: {
        line: cursor.line,
        character: cursor.character,
      },
      selection: {
        start: {
          line: selection.start.line,
          character: selection.start.character,
        },
        end: {
          line: selection.end.line,
          character: selection.end.character,
        },
        isReversed: selection.isReversed,
      },
    };
  }

  /**
   * Extract diagnostics for visible documents
   */
  private extractDiagnostics(): DocumentDiagnostics[] {
    const diagnosticsMap: Map<string, DiagnosticInfo[]> = new Map();

    // Get diagnostics from all visible documents
    for (const editor of this.visibleEditors.values()) {
      const uri = editor.document.uri.toString();
      const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

      const diagnosticInfos: DiagnosticInfo[] = diagnostics.map(diag => ({
        message: diag.message,
        severity: this.mapDiagnosticSeverity(diag.severity),
        source: diag.source,
        line: diag.range.start.line + 1, // Convert to 1-based
        column: diag.range.start.character,
        code: typeof diag.code === 'object' ? diag.code?.value : diag.code,
      }));

      diagnosticsMap.set(uri, diagnosticInfos);
    }

    // Convert to array format
    return Array.from(diagnosticsMap.entries()).map(([uri, diags]) => ({
      uri,
      diagnostics: diags,
    }));
  }

  /**
   * Map VS Code diagnostic severity to our type
   */
  private mapDiagnosticSeverity(
    severity: vscode.DiagnosticSeverity
  ): 'error' | 'warning' | 'information' | 'hint' {
    switch (severity) {
      case vscode.DiagnosticSeverity.Error:
        return 'error';
      case vscode.DiagnosticSeverity.Warning:
        return 'warning';
      case vscode.DiagnosticSeverity.Information:
        return 'information';
      case vscode.DiagnosticSeverity.Hint:
        return 'hint';
      default:
        return 'information';
    }
  }

  /**
   * Get the workspace root URI
   */
  private getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri.toString();
    }
    return undefined;
  }

  /**
   * Format editor state as text references for OpenCode prompts.
   * Follows OpenCode's @file#L10-L20 reference format.
   * @param state - The editor state to format
   * @returns Formatted text reference string
   */
  public static formatAsPromptReference(state: EditorState): string {
    const parts: string[] = [];

    // Active document reference
    if (state.activeDocument) {
      // Get workspace-relative path
      const fileName = state.activeDocument.fileName;
      const relativePath = state.workspaceRoot
        ? fileName.replace(state.workspaceRoot, '').replace(/^[/\\]/, '')
        : fileName;

      let ref = `@${relativePath}`;

      // Add selection line numbers if there's a selection
      const sel = state.selection;
      if (sel.documentUri && sel.selection.start.line !== sel.selection.end.line) {
        // Multi-line selection (1-based line numbers)
        ref += `#L${sel.selection.start.line + 1}-L${sel.selection.end.line + 1}`;
      } else if (sel.documentUri && sel.cursor.line > 0) {
        // Single cursor position
        ref += `#L${sel.cursor.line + 1}`;
      }

      parts.push(ref);
    }

    return parts.join(' ');
  }

  /**
   * Force an immediate state update (bypasses debounce)
   */
  public forceUpdate(): void {
    this.collectAndSendState();
  }

  /**
   * Get the current state without triggering an update
   */
  public getCurrentState(): EditorState | null {
    return this.currentState;
  }

  /**
   * Dispose of all subscriptions
   */
  public dispose(): void {
    // Cancel any pending debounced updates
    if (this.debouncedUpdate) {
      cancelDebounce(this.debouncedUpdate);
    }

    // Dispose all subscriptions
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions = [];

    // Clear state
    this.stateUpdateCallback = null;
    this.visibleEditors.clear();
    this.currentState = null;
  }
}

export default ContextManager;
