# OpenCode Connector for VS Code

**Bridge the gap between your favorite editor and your favorite AI assistant.**

OpenCode is fantastic as a standalone TUI (Terminal User Interface). It's powerful, agentic, and works with any editor. But if you spend your day in VS Code, constantly switching contexts or copy-pasting code snippets breaks your flow.

**This extension integrates the OpenCode TUI directly into your VS Code workflow.**

![OpenCode Connector extension overview](resources/overview.gif)

## Why use this extension?

You shouldn't have to choose between a great editor (VS Code) and a great AI agent (OpenCode). This connector gives you the best of both worlds:

1.  **Context Awareness**: The TUI automatically "knows" what file you are working on. The extension sends your active file, selection, and diagnostics to the OpenCode context.
    - *No more copy-pasting code blocks.*
    - *No more manually typing file paths.*

2.  **Seamless Process Management**:
    - *Auto-Discovery*: The extension automatically finds running OpenCode instances serving your current workspace.
    - *Auto-Spawn*: If no instance is running, it spawns one for you in the integrated terminal.
    - *One command to rule them all.*

## Features

- **`Opencode: Add File to Prompt`**: Instantly send the current file reference (e.g., `@src/main.ts#L10-L20`) to the running TUI session.
- **Automatic Context Sync**: Keeps the AI informed of your active document, selection, and diagnostics.
- **Integrated Terminal**: Runs the OpenCode TUI directly within VS Code's terminal panel.

## Usage

1.  Open your project in VS Code.
2.  The extension will find or spawn an OpenCode TUI session.
3.  Use **`Opencode: Add File to Prompt`** to reference your current code in the TUI.
4. Use **`Explain and Fix (OpenCode)`** to quick fix your issue.

## Configuration

You can customize the extension behavior through the following VS Code settings:

- **`opencode.port`**: The port used to connect to the OpenCode server. (Default: `4096`)
- **`opencode.binaryPath`**: Absolute path to the OpenCode executable. Leave empty to use the one available in your system `PATH`.
- **`opencode.codeAction.severityLevels`**: An array of diagnostic severity levels (`error`, `warning`, `information`, `hint`) that should trigger the "Explain and Fix" code action. (Default: `["error", "warning", "information", "hint"]`)

## Requirements

- VS Code 1.94.0 or higher
- [OpenCode](https://opencode.ai) installed and available in your PATH (or configured via `opencode.binaryPath`)

## Credits

This extension is inspired by:
- [OpenCode VSCode SDK](https://github.com/anomalyco/opencode/tree/dev/sdks/vscode)
- [opencode.nvim](https://github.com/NickvanDyke/opencode.nvim)
