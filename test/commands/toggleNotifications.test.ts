import { handleToggleNotifications } from '../../src/commands/toggleNotifications';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(async () => undefined),
    showErrorMessage: vi.fn(async () => undefined),
  },
}));

describe('handleToggleNotifications', () => {
  let configManager: {
    getNotificationsEnabled: ReturnType<typeof vi.fn>;
    setNotificationsEnabled: ReturnType<typeof vi.fn>;
  };
  let outputChannel: {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = {
      getNotificationsEnabled: vi.fn(() => true),
      setNotificationsEnabled: vi.fn(async () => undefined),
    };
    outputChannel = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  it('disables notifications and confirms the new state', async () => {
    const { window } = await import('vscode');

    await handleToggleNotifications(configManager as never, outputChannel as never);

    expect(configManager.setNotificationsEnabled).toHaveBeenCalledWith(false);
    expect(window.showInformationMessage).toHaveBeenCalledWith('OpenCode notifications disabled.');
  });

  it('enables notifications when they were previously disabled', async () => {
    const { window } = await import('vscode');
    configManager.getNotificationsEnabled.mockReturnValue(false);

    await handleToggleNotifications(configManager as never, outputChannel as never);

    expect(configManager.setNotificationsEnabled).toHaveBeenCalledWith(true);
    expect(window.showInformationMessage).toHaveBeenCalledWith('OpenCode notifications enabled.');
  });

  it('surfaces configuration update failures', async () => {
    const { window } = await import('vscode');
    configManager.setNotificationsEnabled.mockRejectedValueOnce(new Error('boom'));

    await handleToggleNotifications(configManager as never, outputChannel as never);

    expect(outputChannel.error).toHaveBeenCalledWith('Failed to toggle notifications: boom');
    expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to toggle notifications: boom');
  });
});
