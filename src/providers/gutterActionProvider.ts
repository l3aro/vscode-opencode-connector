/**
 * Gutter Action Provider for the OpenCode Connector.
 * Provides gutter decorations on diagnostic lines that trigger QuickPick actions.
 */
import { ConfigManager } from '../config';

import * as vscode from 'vscode';

/**
 * OpenCode Gutter Action Provider
 * Shows gutter icons on lines with diagnostics that open a QuickPick menu.
 */
export class OpenCodeGutterActionProvider {
  private decorationType: vscode.TextEditorDecorationType | undefined;
  private activeEditor: vscode.TextEditor | undefined;
  private subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.createDecorationType();
    this.subscribeToEditorChanges();
  }

  /**
   * Create the gutter decoration type with lightbulb icon
   */
  private createDecorationType(): void {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      gutterIconSize: 'contain',
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      light: {
        gutterIconSize: 'auto',
      },
      dark: {
        gutterIconSize: 'auto',
      },
    });
  }

  /**
   * Subscribe to editor change events
   */
  private subscribeToEditorChanges(): void {
    // Update decorations when active editor changes
    const activeEditorSub = vscode.window.onDidChangeActiveTextEditor(editor => {
      this.activeEditor = editor;
      if (editor) {
        this.updateDecorations(editor);
      }
    });
    this.subscriptions.push(activeEditorSub);

    // Update decorations when diagnostics change
    const diagnosticSub = vscode.languages.onDidChangeDiagnostics(() => {
      if (this.activeEditor) {
        this.updateDecorations(this.activeEditor);
      }
    });
    this.subscriptions.push(diagnosticSub);

    // Also subscribe to editor visible ranges changes (scrolling)
    const visibleRangesSub = vscode.window.onDidChangeTextEditorVisibleRanges(event => {
      if (event.textEditor === this.activeEditor) {
        this.updateDecorations(event.textEditor);
      }
    });

    this.subscriptions.push(visibleRangesSub);
  }

  /**
   * Check if the document is a text file (not binary/image)
   */
  private isTextFile(document: vscode.TextDocument): boolean {
    const textLanguages = [
      'plaintext',
      'markdown',
      'json',
      'javascript',
      'typescript',
      'python',
      'java',
      'cpp',
      'c',
      'go',
      'rust',
      'ruby',
      'php',
      'html',
      'css',
      'scss',
      'yaml',
      'xml',
      'sql',
      'shell',
      'powershell',
    ];

    // Check by language ID
    if (textLanguages.includes(document.languageId)) {
      return true;
    }

    // Check by URI scheme - only file scheme should have gutters
    if (document.uri.scheme !== 'file') {
      return false;
    }

    // Check for binary file extensions
    const binaryExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.bmp',
      '.ico',
      '.pdf',
      '.zip',
      '.tar',
      '.gz',
      '.exe',
      '.dll',
      '.so',
      '.dylib',
    ];
    const fsPath = document.uri.fsPath.toLowerCase();
    if (binaryExtensions.some(ext => fsPath.endsWith(ext))) {
      return false;
    }

    return true;
  }

  /**
   * Update decorations on the editor based on diagnostics
   */
  private updateDecorations(editor: vscode.TextEditor): void {
    if (!this.decorationType) {
      return;
    }

    // Only process text files
    if (!this.isTextFile(editor.document)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    // Get configured severity levels from settings
    const configManager = ConfigManager.getInstance();
    const configuredLevels = configManager.getCodeActionSeverityLevels();

    // Get diagnostics for this document
    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

    // Filter diagnostics based on configured severity levels
    const severityMap: Record<string, vscode.DiagnosticSeverity> = {
      error: vscode.DiagnosticSeverity.Error,
      warning: vscode.DiagnosticSeverity.Warning,
      information: vscode.DiagnosticSeverity.Information,
      hint: vscode.DiagnosticSeverity.Hint,
    };

    const allowedSeverities = new Set(
      configuredLevels
        .map(level => severityMap[level])
        .filter((v): v is vscode.DiagnosticSeverity => v !== undefined)
    );

    // Filter to only allowed severities
    const relevantDiagnostics = diagnostics.filter(d => allowedSeverities.has(d.severity));

    // Create ranges for decoration - only on lines with diagnostics
    const decorationRanges: vscode.Range[] = relevantDiagnostics.map(diagnostic => {
      // Use whole line for the gutter
      const line = editor.document.lineAt(diagnostic.range.start.line);
      return line.range;
    });

    // Apply decorations
    editor.setDecorations(this.decorationType, decorationRanges);

    // Store editor reference for click handling
    this.activeEditor = editor;
  }

  /**
   * Get QuickPick items for gutter actions
   */
  static getGutterQuickPickItems(): Array<{ label: string; description: string }> {
    return [
      { label: '$(lightbulb) Explain Error', description: 'Get AI explanation for this error' },
      { label: '$(wrench) Fix Error', description: 'Let AI fix this error automatically' },
    ];
  }

  /**
   * Handle gutter click - shows QuickPick menu
   */
  async handleGutterClick(
    line: number,
    executeCommand: (command: string, ...args: unknown[]) => void
  ): Promise<string | null> {
    if (!this.activeEditor) {
      return null;
    }

    const document = this.activeEditor.document;
    const diagnostics = vscode.languages.getDiagnostics(document.uri);

    // Find diagnostic at this line
    const diagnosticAtLine = diagnostics.find(
      d => d.range.start.line === line || (d.range.start.line <= line && d.range.end.line >= line)
    );

    if (!diagnosticAtLine) {
      return null;
    }

    // Create QuickPick
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = 'OpenCode Actions';
    quickPick.placeholder = 'Select an action...';
    quickPick.items = OpenCodeGutterActionProvider.getGutterQuickPickItems();

    return new Promise<string | null>(resolve => {
      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        if (selected) {
          if (selected.label.includes('Explain')) {
            // Execute explain command
            executeCommand('opencode.explainAndFix', diagnosticAtLine, document.uri);
            resolve('explain');
          } else if (selected.label.includes('Fix')) {
            // Execute fix command
            executeCommand('opencode.explainAndFix', diagnosticAtLine, document.uri);
            resolve('fix');
          }
        }
        quickPick.dispose();
        resolve(null);
      });

      quickPick.onDidHide(() => {
        quickPick.dispose();
        resolve(null);
      });

      quickPick.show();
    });
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.decorationType?.dispose();
    this.subscriptions.forEach(sub => sub.dispose());
    this.subscriptions = [];
  }
}

export default OpenCodeGutterActionProvider;
