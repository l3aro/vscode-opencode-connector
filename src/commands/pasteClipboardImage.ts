import { ConnectionService } from '../connection/connectionService';
import { WorkspaceUtils } from '../utils/workspace';

import { randomUUID } from 'crypto';
import { isAbsolute, relative, resolve, sep } from 'path';
import * as vscode from 'vscode';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_STORED_IMAGES = 20;

const ImageExtensions: Readonly<Record<string, string>> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

interface ClipboardImageMessage {
  readonly type: 'clipboardImage';
  readonly mimeType: string;
  readonly base64: string;
}

function isClipboardImageMessage(value: unknown): value is ClipboardImageMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    message.type === 'clipboardImage' &&
    typeof message.mimeType === 'string' &&
    typeof message.base64 === 'string'
  );
}

export function decodeClipboardImage(mimeType: string, base64: string): Uint8Array {
  if (!ImageExtensions[mimeType]) {
    throw new Error(`Unsupported clipboard image type: ${mimeType || 'unknown'}`);
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) {
    throw new Error('The clipboard image is empty');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('The clipboard image exceeds the 20 MB limit');
  }

  const hasSignature =
    (mimeType === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mimeType === 'image/gif' &&
      (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' ||
        bytes.subarray(0, 6).toString('ascii') === 'GIF89a')) ||
    (mimeType === 'image/webp' &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP');
  if (!hasSignature) {
    throw new Error(`Clipboard data is not a valid ${mimeType} image`);
  }

  return bytes;
}

export function resolveClipboardImageDirectory(
  workspaceRoot: string,
  configuredDirectory: string
): string {
  const trimmedDirectory = configuredDirectory.trim();
  if (!trimmedDirectory || isAbsolute(trimmedDirectory)) {
    throw new Error('Clipboard image directory must be a workspace-relative path');
  }

  const directory = resolve(workspaceRoot, trimmedDirectory);
  const relativeDirectory = relative(workspaceRoot, directory);
  if (relativeDirectory === '..' || relativeDirectory.startsWith(`..${sep}`)) {
    throw new Error('Clipboard image directory must stay inside the workspace');
  }

  return directory;
}

async function pruneStoredImages(directory: vscode.Uri): Promise<void> {
  const entries = await vscode.workspace.fs.readDirectory(directory);
  const images = entries
    .filter(([, type]) => type === vscode.FileType.File)
    .map(([name]) => name)
    .sort()
    .reverse();

  await Promise.all(
    images.slice(MAX_STORED_IMAGES).map(name =>
      vscode.workspace.fs.delete(vscode.Uri.joinPath(directory, name), {
        recursive: false,
        useTrash: false,
      })
    )
  );
}

function getWebviewHtml(): string {
  const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Paste Clipboard Image</title>
  <style nonce="${nonce}">
    body { display: grid; min-height: 100vh; margin: 0; place-items: center; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { width: min(34rem, calc(100vw - 3rem)); text-align: center; }
    .target { display: grid; min-height: 12rem; padding: 2rem; place-items: center; border: 1px dashed var(--vscode-input-border, var(--vscode-contrastBorder)); border-radius: 6px; background: var(--vscode-input-background); outline: none; }
    .target:focus { border-color: var(--vscode-focusBorder); }
    h1 { margin: 0 0 .5rem; font-size: 1.25rem; font-weight: 600; }
    p { margin: 0; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <main id="target" class="target" tabindex="0">
    <div><h1>Paste an image</h1><p>Use your normal paste shortcut.</p></div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const target = document.getElementById('target');
    target.focus();
    document.addEventListener('paste', event => {
      const item = Array.from(event.clipboardData?.items ?? []).find(candidate => candidate.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) {
        vscode.postMessage({ type: 'clipboardError', message: 'The clipboard does not contain an image.' });
        return;
      }
      event.preventDefault();
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');
        vscode.postMessage({ type: 'clipboardImage', mimeType: file.type, base64: comma >= 0 ? result.slice(comma + 1) : '' });
      });
      reader.addEventListener('error', () => vscode.postMessage({ type: 'clipboardError', message: 'Failed to read the clipboard image.' }));
      reader.readAsDataURL(file);
    });
  </script>
</body>
</html>`;
}

/**
 * Capture an image pasted into a local webview and add its remote file path to OpenCode.
 * @param connectionService - Active OpenCode connection manager
 * @param outputChannel - Extension log channel
 */
export async function handlePasteClipboardImage(
  connectionService: ConnectionService,
  outputChannel: vscode.LogOutputChannel
): Promise<void> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  const workspacePath = activeUri
    ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
    : undefined;
  const panel = vscode.window.createWebviewPanel(
    'opencodePasteClipboardImage',
    'Paste Clipboard Image',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] }
  );
  panel.webview.html = getWebviewHtml();

  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!isClipboardImageMessage(message)) {
      const errorMessage =
        message && typeof message === 'object' && 'message' in message
          ? String(message.message)
          : 'The clipboard does not contain a supported image.';
      await vscode.window.showWarningMessage(errorMessage);
      return;
    }

    try {
      const bytes = decodeClipboardImage(message.mimeType, message.base64);
      const connected = workspacePath
        ? await connectionService.ensureConnectedForWorkspace(workspacePath)
        : await connectionService.ensureConnected();
      const client = connectionService.getClient();
      if (!connected || !client) {
        throw new Error('No OpenCode instance is available');
      }

      const workspaceRoot = workspacePath ?? WorkspaceUtils.getWorkspacePath();
      if (!workspaceRoot) {
        throw new Error('Open a workspace folder to paste clipboard images');
      }
      const configuredDirectory = connectionService.getConfigManager().getClipboardImageDirectory();
      const directory = vscode.Uri.file(
        resolveClipboardImageDirectory(workspaceRoot, configuredDirectory)
      );
      await vscode.workspace.fs.createDirectory(directory);
      const extension = ImageExtensions[message.mimeType];
      const imageUri = vscode.Uri.joinPath(directory, `${Date.now()}-${randomUUID()}.${extension}`);
      await vscode.workspace.fs.writeFile(imageUri, bytes);
      await pruneStoredImages(directory);

      const relPath = relative(workspaceRoot, imageUri.fsPath).split(sep).join('/');
      await client.appendPrompt(`@${relPath}`);
      outputChannel.info(`[pasteClipboardImage] Added ${relPath} to the prompt`);
      vscode.window.setStatusBarMessage('$(check) Clipboard image added to OpenCode', 3000);
      panel.dispose();
      await vscode.window.showInformationMessage('Clipboard image sent to OpenCode.');

      if (connectionService.getConfigManager().getAutoFocusTerminal()) {
        await connectionService.focusTerminal();
      }
    } catch (err) {
      outputChannel.error(`[pasteClipboardImage] ${(err as Error).message}`);
      await vscode.window.showErrorMessage(
        `Failed to add clipboard image: ${(err as Error).message}`
      );
    }
  });
}
