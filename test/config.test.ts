import { ConfigManager } from '../src/config';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const update = vi.fn(async () => undefined);

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get,
      update,
    })),
  },
  ConfigurationTarget: {
    Global: 'global',
  },
}));

describe('ConfigManager notifications setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true by default when notificationsEnabled is unset', () => {
    get.mockReturnValueOnce(undefined);

    const configManager = ConfigManager.getInstance({} as never);

    expect(configManager.getNotificationsEnabled()).toBe(true);
  });

  it('persists notificationsEnabled updates globally', async () => {
    const configManager = ConfigManager.getInstance({} as never);

    await configManager.setNotificationsEnabled(false);

    expect(update).toHaveBeenCalledWith('notificationsEnabled', false, 'global');
  });
});
