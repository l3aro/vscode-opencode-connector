import * as path from 'path';

/**
 * Check if a file path is a directory based on heuristics:
 * - Path ends with a directory separator
 * - Basename has no extension (e.g., 'src', 'node_modules')
 *
 * Note: This is a heuristic and may misclassify extensionless files
 * like 'Makefile', 'Dockerfile', or hidden files like '.gitignore'.
 *
 * @param filePath - The file path to check
 * @returns True if the path appears to be a directory
 */
export function isDirectory(filePath: string): boolean {
  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    return true;
  }

  const basename = path.basename(filePath);
  return !basename.includes('.');
}

/**
 * Format an absolute path for sending to OpenCode
 * @param fsPath - The absolute file system path
 * @returns Formatted path string with @ prefix and trailing slash for directories
 */
export function formatAbsolutePath(fsPath: string): string {
  let formatted = '@' + fsPath;
  if (isDirectory(fsPath)) {
    formatted += path.sep;
  }
  return formatted;
}

/**
 * Format paths for sending to OpenCode
 * @param resources - Array of VS Code URIs
 * @returns Formatted path string with @ prefix and trailing slashes for directories
 */
export function formatPaths(resources: { fsPath: string }[]): string {
  const paths = resources.map(uri => formatAbsolutePath(uri.fsPath));
  return paths.join('\n');
}

/**
 * Format a relative path for sending to OpenCode
 * @param relativePath - The relative path
 * @param isDir - Whether the path is a directory
 * @returns Formatted path string with @ prefix and trailing slash for directories
 */
export function formatRelativePath(relativePath: string, isDir: boolean): string {
  let formatted = '@' + relativePath;
  if (isDir) {
    formatted += path.sep;
  }
  return formatted;
}
