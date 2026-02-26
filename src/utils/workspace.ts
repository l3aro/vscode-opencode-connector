/**
 * Workspace utilities for OpenCode VSCode extension
 * Handles workspace root detection and multi-root workspace support
 */
import * as crypto from 'crypto';
import * as vscode from 'vscode';

/**
 * Workspace root information
 */
export interface WorkspaceRootInfo {
  /** The URI of the workspace root */
  uri: vscode.Uri;
  /** The name of the workspace folder */
  name: string;
  /** The index of this workspace folder (0-based) */
  index: number;
  /** Whether this is the first/primary workspace */
  isPrimary: boolean;
}

/**
 * Result of workspace detection
 */
export interface WorkspaceDetectionResult {
  /** Whether a workspace is open */
  isWorkspaceOpen: boolean;
  /** List of workspace roots (empty if no workspace) */
  roots: WorkspaceRootInfo[];
  /** The primary workspace root (first one) */
  primaryRoot: WorkspaceRootInfo | null;
  /** All workspace root URIs as strings */
  rootUris: string[];
  /** Number of workspace folders */
  rootCount: number;
}

/**
 * Workspace utilities
 */
export const WorkspaceUtils = {
  /**
   * Detect the current workspace state
   * @returns WorkspaceDetectionResult
   */
  detectWorkspace(): WorkspaceDetectionResult {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return {
        isWorkspaceOpen: false,
        roots: [],
        primaryRoot: null,
        rootUris: [],
        rootCount: 0,
      };
    }

    const roots: WorkspaceRootInfo[] = workspaceFolders.map((folder, index) => ({
      uri: folder.uri,
      name: folder.name,
      index,
      isPrimary: index === 0,
    }));

    return {
      isWorkspaceOpen: true,
      roots,
      primaryRoot: roots[0] || null,
      rootUris: workspaceFolders.map(f => f.uri.toString()),
      rootCount: workspaceFolders.length,
    };
  },

  /**
   * Get the primary workspace root URI
   * @returns URI of primary workspace or undefined
   */
  getPrimaryWorkspaceUri(): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      return workspaceFolders[0].uri;
    }
    return undefined;
  },

  /**
   * Get the primary workspace root as a string
   * @returns String URI or empty string
   */
  getPrimaryWorkspaceRoot(): string {
    const primaryUri = this.getPrimaryWorkspaceUri();
    return primaryUri?.toString() || '';
  },

  /**
   * Get all workspace root URIs
   * @returns Array of URI objects
   */
  getAllWorkspaceUris(): vscode.Uri[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.map(f => f.uri) || [];
  },

  /**
   * Get all workspace roots as strings
   * @returns Array of string URIs
   */
  getAllWorkspaceRoots(): string[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders?.map(f => f.uri.toString()) || [];
  },

  /**
   * Check if a file URI is within a workspace
   * @param fileUri - The file URI to check
   * @returns Whether the file is within any workspace
   */
  isFileInWorkspace(fileUri: vscode.Uri): boolean {
    const workspaceRoots = this.getAllWorkspaceUris();
    const filePath = fileUri.fsPath;

    for (const rootUri of workspaceRoots) {
      const rootPath = rootUri.fsPath;
      if (filePath.startsWith(rootPath) || filePath === rootPath) {
        return true;
      }
    }

    return false;
  },

  /**
   * Get the workspace root for a file
   * @param fileUri - The file URI
   * @returns The workspace root URI or undefined
   */
  getWorkspaceRootForFile(fileUri: vscode.Uri): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return undefined;
    }

    const filePath = fileUri.fsPath;

    // Find the most specific (longest matching) workspace root
    let bestMatch: vscode.Uri | undefined;
    let bestMatchLength = -1;

    for (const folder of workspaceFolders) {
      const rootPath = folder.uri.fsPath;
      if (filePath.startsWith(rootPath)) {
        const matchLength = rootPath.length;
        if (matchLength > bestMatchLength) {
          bestMatch = folder.uri;
          bestMatchLength = matchLength;
        }
      }
    }

    return bestMatch;
  },

  /**
   * Get the workspace root path as a filesystem path
   * @param index - Workspace folder index (default: 0)
   * @returns Filesystem path or empty string
   */
  getWorkspacePath(index: number = 0): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders[index]) {
      return workspaceFolders[index].uri.fsPath;
    }
    return '';
  },

  /**
   * Check if in multi-root workspace
   * @returns Whether multiple workspace folders are open
   */
  isMultiRootWorkspace(): boolean {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return workspaceFolders ? workspaceFolders.length > 1 : false;
  },

  /**
   * Get workspace name
   * @returns Name of first workspace or 'undefined'
   */
  getWorkspaceName(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      // Use workspace name if available, otherwise folder name
      return vscode.workspace.name || workspaceFolders[0].name;
    }
    return 'undefined';
  },

  /**
   * Generate an 8-character MD5 hash for a workspace path
   * @param workspacePath - The workspace path to hash
   * @returns 8-character hexadecimal hash string
   */
  getWorkspaceHash(workspacePath: string): string {
    return crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 8);
  },

  getActiveFileRef(): string | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return undefined;
    }

    const document = activeEditor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    const relativePath = vscode.workspace.asRelativePath(document.uri);
    let ref = `@${relativePath}`;

    const selection = activeEditor.selection;
    if (!selection.isEmpty) {
      const startLine = selection.start.line + 1;
      const endLine = selection.end.line + 1;
      if (startLine === endLine) {
        ref += `#L${startLine}`;
      } else {
        ref += `#L${startLine}-${endLine}`;
      }
    }

    return ref;
  },
};

export default WorkspaceUtils;
