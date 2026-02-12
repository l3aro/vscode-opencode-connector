# OpenCode Connector for VS Code

**Bridge the gap between your favorite editor and your favorite AI assistant.**

OpenCode is fantastic as a standalone TUI (Terminal User Interface). It's powerful, agentic, and works with any editor. But if you spend your day in VS Code, constantly switching contexts or copy-pasting code snippets breaks your flow.

**This extension integrates the OpenCode TUI directly into your VS Code workflow.**

## Why use this extension?

You shouldn't have to choose between a great editor (VS Code) and a great AI agent (OpenCode). This connector gives you the best of both worlds:

1.  **Context Awareness**: The TUI automatically "knows" what file you are working on. The extension sends your active file, selection, and diagnostics to the OpenCode context.
    - *No more copy-pasting code blocks.*
    - *No more manually typing file paths.*

2.  **Visualized Memory (`AGENTS.md`)**: OpenCode maintains a persistent memory of your session. This extension syncs that memory to a local `AGENTS.md` file in your workspace.
    - *See the AI's current plan and context evolve in real-time right in your file explorer.*
    - *Reference the plan without leaving your editor.*

3.  **Seamless Process Management**:
    - *Auto-Discovery*: The extension automatically finds running OpenCode instances serving your current workspace.
    - *Auto-Spawn*: If no instance is running, it spawns one for you in the integrated terminal.
    - *One command to rule them all.*

## Features

- **`Opencode: Add File to Prompt`**: Instantly send the current file reference (e.g., `@src/main.ts#L10-L20`) to the running TUI session.
- **Automatic Context Sync**: Keeps the AI informed of your active document, selection, and diagnostics.
- **Memory Sync**: Periodically writes the AI's session state to `AGENTS.md`.
- **Integrated Terminal**: Runs the OpenCode TUI directly within VS Code's terminal panel.

## Usage

1.  Open your project in VS Code.
2.  Run the command **`Opencode: Check Instance`** (or just start working).
3.  The extension will find or spawn an OpenCode TUI session.
4.  Use **`Opencode: Add File to Prompt`** to reference your current code in the TUI.
5.  Watch `AGENTS.md` update as you collaborate with the AI.

## Requirements

- VS Code 1.74.0 or higher
- [OpenCode](https://github.com/dpup/opencode) installed and available in your PATH (or configured via `opencode.binaryPath`)
