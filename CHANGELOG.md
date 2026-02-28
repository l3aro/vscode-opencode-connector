# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-02-28

### Added
- Explorer context menu with submenu for sending paths to OpenCode (#16)
  - `Send Path`: Send absolute file/folder paths
  - `Send Relative Path`: Send relative paths
  - Support for multiple file/folder selection
- Debug context command to send debugging information to OpenCode (#15)

### Changed
- Improved workspace detection with parent/child directory matching (#14)

### Removed
- Gutter integration (#12)
- Unused ContextManager component (#13)

### Fixed
- Better handling of multiple OpenCode instances (#10)

## [1.1.0] - 2025-XX-XX

### Added
- Enhanced status bar and gutter actions (#9)
- Multi-file picker for selecting multiple files to add to prompt (#7)
- Auto-focus terminal after prompt send (#6)

### Changed
- Split extension.ts into modular components (#8)

## [1.0.5] - 2025-XX-XX

### Fixed
- Verify workspace match when reusing existing client

## [1.0.4] - 2025-XX-XX

### Fixed
- Use explicit undefined check instead of Boolean filter for severity (#5)

## [1.0.3] - 2025-XX-XX

### Fixed
- Improve SSH remote connection detection (#4)
- Handle outputChannel creation error gracefully

## [1.0.2] - 2025-XX-XX

### Added
- Log cwd and port when sending to prompt
