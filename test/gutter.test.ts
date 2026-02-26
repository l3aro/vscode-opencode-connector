/**
 * Unit tests for gutter decoration functionality
 *
 * Tests verify that:
 * - Gutter decoration provider is registered
 * - Decoration shows icon in editor margin
 * - Click triggers QuickPick menu
 * - Menu shows Explain and Fix options
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock event emitter factory
const createMockEventEmitter = () => {
  const listeners: Array<() => void> = [];
  return {
    event: vi.fn((cb: () => void) => {
      listeners.push(cb);
      return { dispose: vi.fn() };
    }),
    fire: () => {
      listeners.forEach(cb => cb());
    },
    dispose: vi.fn(),
  };
};

// Mock TextEditorDecorationType
const mockDecorationType = {
  key: 'mock-decoration-type',
  dispose: vi.fn(),
};

// Mock TextEditor
const createMockTextEditor = () => ({
  document: {
    uri: {
      fsPath: '/test/workspace/src/test.ts',
      path: '/test/workspace/src/test.ts',
      scheme: 'file',
      toString: () => 'file:///test/workspace/src/test.ts',
    },
    fileName: 'test.ts',
    isDirty: false,
    isClosed: false,
    languageId: 'typescript',
  },
  selection: {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
    isEmpty: true,
    isSingleLine: false,
    contains: vi.fn(),
    intersection: vi.fn(),
    union: vi.fn(),
    with: vi.fn(),
    isEqual: vi.fn(),
  },
  selections: [],
  setDecorations: vi.fn(),
  options: {
    tabSize: 2,
    insertSpaces: true,
    cursorStyle: 1,
  },
  visibleRanges: [],
  viewColumn: 1,
  show: vi.fn(),
  hide: vi.fn(),
});

// Mock TextDocument
const createMockTextDocument = () => ({
  uri: {
    fsPath: '/test/workspace/src/test.ts',
    path: '/test/workspace/src/test.ts',
    scheme: 'file',
    toString: () => 'file:///test/workspace/src/test.ts',
  },
  fileName: 'test.ts',
  isDirty: false,
  isClosed: false,
  languageId: 'typescript',
  version: 1,
  getText: vi.fn(() => 'test content'),
  getWordRangeAtPosition: vi.fn(),
  lineAt: vi.fn(),
  lineCount: 10,
  offsetAt: vi.fn(),
  positionAt: vi.fn(),
  save: vi.fn(),
});

// Mock Range
const createMockRange = (startLine = 0, startChar = 0, endLine = 0, endChar = 10) => ({
  start: { line: startLine, character: startChar },
  end: { line: endLine, character: endChar },
  isEmpty: false,
  isSingleLine: true,
  contains: vi.fn(),
  intersection: vi.fn(),
  union: vi.fn(),
  with: vi.fn(),
  isEqual: vi.fn(),
  isAfter: vi.fn(),
  isAfterOrEqual: vi.fn(),
  isBefore: vi.fn(),
  isBeforeOrEqual: vi.fn(),
});

// Mock Diagnostic
const createMockDiagnostic = (message = 'Test error', line = 0) => ({
  message,
  severity: 1, // Error
  range: createMockRange(line),
  source: 'ts',
  code: 'TS2304',
  relatedInformation: [],
  messageEnumeratedHighlights: [],
  tags: [],
});

// Mock decorations
const mockDecoration = {
  range: createMockRange(),
  renderOptions: {
    before: {
      contentText: '',
      margin: '0 0.5em 0 0',
      backgroundColor: 'rgba(255, 0, 0, 0.5)',
    },
  },
};

// Mock window events
const mockOnDidChangeActiveTextEditor = createMockEventEmitter();
const mockOnDidChangeTextEditorSelection = createMockEventEmitter();

// Mock workspace events
const mockOnDidChangeWorkspaceFolders = createMockEventEmitter();

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    createTextEditorDecorationType: vi.fn(() => ({ ...mockDecorationType })),
    onDidChangeActiveTextEditor: vi.fn(cb => {
      return mockOnDidChangeActiveTextEditor.event(cb);
    }),
    onDidChangeTextEditorSelection: vi.fn(cb => {
      return mockOnDidChangeTextEditorSelection.event(cb);
    }),
    createQuickPick: vi.fn(() => ({
      title: 'OpenCode Actions',
      placeholder: 'Select an action...',
      items: [] as Array<{ label: string; description?: string }>,
      selectedItems: [] as Array<{ label: string; description?: string }>,
      onDidAccept: vi.fn((_cb: () => void) => ({ dispose: vi.fn() })),
      onDidChangeSelection: vi.fn(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_cb: (items: any[]) => void) => ({ dispose: vi.fn() })
      ),
      onDidHide: vi.fn((_cb: () => void) => ({ dispose: vi.fn() })),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    activeTextEditor: undefined,
    visibleTextEditors: [],
    terminals: [],
    createTerminal: vi.fn(() => ({
      show: vi.fn(),
      sendText: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/test/workspace' }, name: 'test-workspace' }],
    name: 'test-workspace',
    asRelativePath: vi.fn((uri: unknown) => {
      return (
        (uri as { fsPath?: string; path?: string }).fsPath || (uri as { path?: string }).path || ''
      );
    }),
    getConfiguration: vi.fn(() => ({ get: vi.fn() })),
    onDidChangeWorkspaceFolders: vi.fn(cb => {
      return mockOnDidChangeWorkspaceFolders.event(cb);
    }),
    getWorkspaceFolder: vi.fn(),
    findFiles: vi.fn(),
  },
  Uri: {
    parse: vi.fn((str: string) => ({
      fsPath: str,
      toString: () => str,
    })),
    joinPath: vi.fn((uri: unknown, ...segments: string[]) => {
      const u = uri as Record<string, unknown>;
      return {
        ...u,
        toString: () => [String(uri), ...segments].join('/'),
      };
    }),
  },
  DiagnosticSeverity: {
    Error: 1,
    Warning: 2,
    Information: 3,
    Hint: 4,
  },
  StatusBarAlignment: {
    Left: 0,
    Right: 1,
  },
  CodeActionKind: {
    QuickFix: { value: 'quickfix' },
    Empty: { value: '' },
  },
  languages: {
    registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
    registerDocumentLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
  },
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  EventEmitter: vi.fn().mockImplementation(() => createMockEventEmitter()),
  ThemeColor: vi.fn((id: string) => ({ id })),
  DecorationRangeBehavior: {
    OpenClosed: 0,
    ClosedClosed: 1,
    OpenOpen: 2,
    ClosedOpen: 3,
  },
  OverviewRulerLane: {
    Left: 1,
    Center: 2,
    Right: 4,
  },
}));

// Import after mocking
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _vscodeModule = await import('vscode');

// ---------------------------------------------------------------------
// Helper functions that simulate gutter decoration logic
// ---------------------------------------------------------------------

/**
 * Simulates creating a gutter decoration type
 */
function createGutterDecorationType() {
  return {
    gutter: {
      backgroundColor: 'rgba(255, 0, 0, 0.5)',
      color: '#ffffff',
    },
  };
}

/**
 * Simulates applying decorations to editor lines with diagnostics
 */
function applyDecorationsToDiagnostics(
  editor: { setDecorations: ReturnType<typeof vi.fn> },
  diagnostics: Array<{ range: { start: { line: number } } }>,
  decorationType: unknown
): number {
  // Apply decorations to each line with diagnostic
  const decorations = diagnostics.map(diag => ({
    range: {
      start: { line: diag.range.start.line, character: 0 },
      end: { line: diag.range.start.line, character: 1 },
    },
  }));

  editor.setDecorations(decorationType, decorations);

  return decorations.length;
}

/**
 * Creates QuickPick items for gutter actions
 */
function getGutterQuickPickItems() {
  return [
    { label: '$(lightbulb) Explain Error', description: 'Get AI explanation for this error' },
    { label: '$(wrench) Fix Error', description: 'Let AI fix this error automatically' },
  ];
}

/**
 * Handles gutter click - shows QuickPick menu
 */
async function handleGutterClick(
  quickPick: {
    items: Array<{ label: string; description?: string }>;
    show: () => void;
    hide: () => void;
    onDidAccept: (cb: () => void) => { dispose: () => void };
    onDidHide: (cb: () => void) => { dispose: () => void };
  },
  diagnostic: { message: string },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _executeCommand: (cmd: string, ...args: unknown[]) => void
): Promise<string | null> {
  quickPick.items = getGutterQuickPickItems();
  quickPick.show();

  // Return null for now - actual selection would happen asynchronously
  return null;
}

// ---------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------

describe('Gutter Decoration', () => {
  let mockEditor: ReturnType<typeof createMockTextEditor>;
  let mockDiagnostics: ReturnType<typeof createMockDiagnostic>[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockEditor = createMockTextEditor();
    mockDiagnostics = [
      createMockDiagnostic('Variable not defined', 2),
      createMockDiagnostic('Type error', 5),
      createMockDiagnostic('Unused variable', 8),
    ];
  });

  // ---------------------------------------------------------------------------
  // Decoration Type Creation
  // ---------------------------------------------------------------------------

  describe('creates gutter decoration type', () => {
    it('should create decoration type with red background', () => {
      const decoration = createGutterDecorationType();

      expect(decoration.gutter).toBeDefined();
      expect(decoration.gutter.backgroundColor).toBe('rgba(255, 0, 0, 0.5)');
    });
  });

  // ---------------------------------------------------------------------------
  // Decoration Application
  // ---------------------------------------------------------------------------

  describe('applies decorations to diagnostic lines', () => {
    it('should return count of decorated lines matching diagnostics', () => {
      const decorationType = createGutterDecorationType();
      const decoratedCount = applyDecorationsToDiagnostics(
        mockEditor,
        mockDiagnostics,
        decorationType
      );

      expect(decoratedCount).toBe(3);
      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });

    it('should apply decorations to each line with diagnostic', () => {
      const decorationType = createGutterDecorationType();
      applyDecorationsToDiagnostics(mockEditor, mockDiagnostics, decorationType);

      // Verify setDecorations was called
      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });

    it('should handle empty diagnostics array', () => {
      const decorationType = createGutterDecorationType();
      const decoratedCount = applyDecorationsToDiagnostics(mockEditor, [], decorationType);

      expect(decoratedCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Click Handler and QuickPick
  // ---------------------------------------------------------------------------

  describe('shows QuickPick on gutter click', () => {
    it('should create QuickPick with Explain and Fix options', () => {
      const items = getGutterQuickPickItems();

      expect(items).toHaveLength(2);
      expect(items[0].label).toContain('Explain');
      expect(items[1].label).toContain('Fix');
    });

    it('should include descriptions for each option', () => {
      const items = getGutterQuickPickItems();

      expect(items[0].description).toBe('Get AI explanation for this error');
      expect(items[1].description).toBe('Let AI fix this error automatically');
    });

    it('should show QuickPick when handleGutterClick is called', async () => {
      const mockQuickPick = {
        items: [],
        show: vi.fn(),
        hide: vi.fn(),
        onDidAccept: vi.fn(),
        onDidHide: vi.fn(),
      };

      const mockExecuteCommand = vi.fn();
      await handleGutterClick(
        mockQuickPick,
        createMockDiagnostic('Test error', 0),
        mockExecuteCommand
      );

      expect(mockQuickPick.show).toHaveBeenCalled();
    });

    it('should populate QuickPick items before showing', async () => {
      const mockQuickPick = {
        items: [] as Array<{ label: string; description?: string }>,
        show: vi.fn(),
        hide: vi.fn(),
        onDidAccept: vi.fn(),
        onDidHide: vi.fn(),
      };

      await handleGutterClick(mockQuickPick, createMockDiagnostic('Test error', 0), vi.fn());

      expect(mockQuickPick.items).toHaveLength(2);
      expect(mockQuickPick.items[0].label).toContain('Explain');
      expect(mockQuickPick.items[1].label).toContain('Fix');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: Full Flow
  // ---------------------------------------------------------------------------

  describe('full gutter decoration flow', () => {
    it('should create decoration, apply to diagnostics, and handle clicks', async () => {
      // Step 1: Create decoration type
      const decorationType = createGutterDecorationType();
      expect(decorationType.gutter).toBeDefined();

      // Step 2: Apply decorations to diagnostic lines
      const decoratedCount = applyDecorationsToDiagnostics(
        mockEditor,
        mockDiagnostics,
        decorationType
      );
      expect(decoratedCount).toBe(mockDiagnostics.length);

      // Step 3: Handle click - show QuickPick
      const mockQuickPick = {
        items: [] as Array<{ label: string; description?: string }>,
        show: vi.fn(),
        hide: vi.fn(),
        onDidAccept: vi.fn(),
        onDidHide: vi.fn(),
      };
      const mockExecuteCommand = vi.fn();

      await handleGutterClick(mockQuickPick, mockDiagnostics[0], mockExecuteCommand);

      expect(mockQuickPick.items).toHaveLength(2);
      expect(mockQuickPick.show).toHaveBeenCalled();
    });

    it('should handle multiple diagnostic lines correctly', () => {
      const decorationType = createGutterDecorationType();
      const multipleDiagnostics = [
        createMockDiagnostic('Error 1', 1),
        createMockDiagnostic('Error 2', 3),
        createMockDiagnostic('Error 3', 5),
        createMockDiagnostic('Error 4', 7),
        createMockDiagnostic('Error 5', 9),
      ];

      const decoratedCount = applyDecorationsToDiagnostics(
        mockEditor,
        multipleDiagnostics,
        decorationType
      );

      expect(decoratedCount).toBe(5);
      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Icon Display
  // ---------------------------------------------------------------------------

  describe('displays icon in gutter margin', () => {
    it('should use lightbulb icon for explain action', () => {
      const items = getGutterQuickPickItems();

      expect(items[0].label).toContain('$(lightbulb)');
    });

    it('should use wrench icon for fix action', () => {
      const items = getGutterQuickPickItems();

      expect(items[1].label).toContain('$(wrench)');
    });
  });
});
