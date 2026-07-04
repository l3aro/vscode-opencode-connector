import {
  decodeClipboardImage,
  resolveClipboardImageDirectory,
} from '../../src/commands/pasteClipboardImage';

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

describe('decodeClipboardImage', () => {
  it('decodes a supported base64 image', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    expect(decodeClipboardImage('image/png', png.toString('base64'))).toEqual(png);
  });

  it('rejects unsupported image types', () => {
    expect(() => decodeClipboardImage('image/svg+xml', 'aGVsbG8=')).toThrow(
      'Unsupported clipboard image type'
    );
  });

  it('rejects an empty image', () => {
    expect(() => decodeClipboardImage('image/png', '')).toThrow('clipboard image is empty');
  });

  it('rejects images over 20 MB', () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64');
    expect(() => decodeClipboardImage('image/png', oversized)).toThrow('exceeds the 20 MB limit');
  });

  it('rejects data that does not match the declared image type', () => {
    expect(() =>
      decodeClipboardImage('image/png', Buffer.from('not png').toString('base64'))
    ).toThrow('not a valid image/png image');
  });
});

describe('resolveClipboardImageDirectory', () => {
  it('resolves a configured directory inside the workspace', () => {
    expect(resolveClipboardImageDirectory('/workspace', '.opencode/images')).toBe(
      '/workspace/.opencode/images'
    );
  });

  it('rejects absolute directories', () => {
    expect(() => resolveClipboardImageDirectory('/workspace', '/tmp/images')).toThrow(
      'workspace-relative path'
    );
  });

  it('rejects directories that escape the workspace', () => {
    expect(() => resolveClipboardImageDirectory('/workspace', '../images')).toThrow(
      'stay inside the workspace'
    );
  });
});
