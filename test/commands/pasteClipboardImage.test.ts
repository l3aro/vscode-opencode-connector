import {
  decodeClipboardImage,
  isStoredClipboardImageName,
  resolveClipboardImageDirectory,
  resolveClipboardImageFilenamePrefix,
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

describe('resolveClipboardImageFilenamePrefix', () => {
  it('uses the default prefix when unset', () => {
    expect(resolveClipboardImageFilenamePrefix('')).toBe('opencode-clipboard-');
  });

  it('trims configured prefixes', () => {
    expect(resolveClipboardImageFilenamePrefix(' pasted-image- ')).toBe('pasted-image-');
  });

  it('rejects path separators', () => {
    expect(() => resolveClipboardImageFilenamePrefix('images/paste-')).toThrow(
      'must not contain path separators'
    );
    expect(() => resolveClipboardImageFilenamePrefix('images\\paste-')).toThrow(
      'must not contain path separators'
    );
  });
});

describe('isStoredClipboardImageName', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  it('matches generated clipboard image names with the configured prefix', () => {
    expect(isStoredClipboardImageName(`custom-${Date.now()}-${uuid}.png`, 'custom-')).toBe(true);
  });

  it('escapes regex characters in configured prefixes', () => {
    expect(isStoredClipboardImageName(`paste+(1)-123-${uuid}.webp`, 'paste+(1)-')).toBe(true);
  });

  it('does not match unrelated files in the same directory', () => {
    expect(isStoredClipboardImageName('logo.png', 'opencode-clipboard-')).toBe(false);
    expect(
      isStoredClipboardImageName(
        `opencode-clipboard-${Date.now()}-${uuid}.txt`,
        'opencode-clipboard-'
      )
    ).toBe(false);
    expect(
      isStoredClipboardImageName(`other-${Date.now()}-${uuid}.png`, 'opencode-clipboard-')
    ).toBe(false);
  });
});
