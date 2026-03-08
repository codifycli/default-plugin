# Codify Default Plugin

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

The default plugin for [Codify](https://codifycli.com) - a declarative system configuration tool that manages your development environment as code.

## What is Codify?

Codify allows you to define your entire development environment in a single JSON configuration file. Instead of remembering dozens of installation commands and configuration steps, you describe your desired system state and Codify makes it happen.

## What's in this Plugin?

This plugin provides **50+ resources** for managing common development tools and configurations across macOS and Linux. Think of it as Infrastructure-as-Code for your local development machine.

### Available Resources

#### Package Managers
- **homebrew** - Install and manage Homebrew formulae and casks (macOS)
- **apt** - Debian/Ubuntu package management
- **yum** - RedHat/CentOS package management
- **dnf** - Fedora package management
- **snap** - Universal Linux packages
- **macports** - MacPorts package manager

#### Version Managers
- **nvm** - Node.js version management
- **pyenv** - Python version management
- **jenv** - Java version management
- **asdf** - Universal version manager

#### Programming Languages & Tools
- **npm** - Node.js packages (global installs)
- **npm-login** - NPM authentication
- **pnpm** - Fast, disk-efficient package manager
- **pip** - Python package installation
- **pip-sync** - Python dependency synchronization
- **virtualenv** - Python virtual environments
- **venv-project** - Python venv projects

#### Version Control
- **git** - Git configuration (name, email, signing)
- **git-lfs** - Git Large File Storage
- **git-repository** - Clone and manage git repositories
- **wait-github-ssh-key** - Wait for GitHub SSH key availability

#### Cloud & DevOps
- **aws-cli** - AWS Command Line Interface
- **aws-profile** - AWS credential profiles
- **docker** - Docker container platform
- **terraform** - Infrastructure as Code

#### Shell Configuration
- **alias** - Individual shell aliases
- **aliases** - Manage multiple aliases at once
- **path** - PATH environment variable management
- **action** - Custom shell scripts and actions

#### SSH & Security
- **ssh-key** - Generate and manage SSH keys
- **ssh-config** - SSH client configuration
- **ssh-add** - Add SSH keys to agent

#### Development Tools
- **vscode** - Visual Studio Code extensions and settings
- **android-studio** - Android Studio IDE
- **xcode-tools** - Xcode Command Line Tools
- **pgcli** - Postgres CLI with auto-completion

#### Virtualization
- **tart** - macOS and Linux VM management
- **tart-vm** - Individual Tart VMs

#### File Management
- **file** - Local file management
- **remote-file** - Download and manage remote files

## Quick Start

### Installation

First, install the Codify CLI:

```bash
/bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"
```

### Basic Usage

Create a `codify.json` file in your home directory or project:

```json
[
  {
    "type": "homebrew",
    "formulae": ["git", "node", "python"],
    "casks": ["visual-studio-code", "docker"]
  },
  {
    "type": "git",
    "name": "John Doe",
    "email": "john@example.com"
  },
  {
    "type": "aliases",
    "aliases": [
      { "alias": "ll", "value": "ls -la" },
      { "alias": "gs", "value": "git status" }
    ]
  }
]
```

Apply your configuration:

```bash
codify apply
```

That's it! Codify will install the packages, configure git, and set up your shell aliases.

## Example Configurations

### Full Stack Development Setup

```json
[
   {
      "type": "homebrew",
      "formulae": ["postgresql@18", "redis"]
   },
   {
      "type": "nvm",
      "nodeVersions": ["20.0.0", "18.0.0"],
      "global": "20.0.0"
   },
   {
      "type": "git-repository",
      "parentDirectory": "~/projects",
      "repositories": [
         "git@github.com:myorg/frontend.git",
         "git@github.com:myorg/backend.git"
      ]
   },
   {
      "type": "vscode"
   },
   {
      "type": "docker"
   }
]
```

### Python Data Science Environment

```json
[
   {
      "type": "pyenv",
      "pythonVersions": ["3.11.0", "3.10.0"],
      "global": "3.11.0"
   },
   {
      "type": "pip",
      "install": ["pandas", "numpy", "matplotlib", "scikit-learn"]
   },
   {
      "type": "venv-project",
      "envDir": ".venv",
      "cwd": "~/data-science",
      "automaticallyInstallRequirementsTxt": true
   }
]
```

### DevOps Toolkit

```json
[
   {
      "type": "homebrew",
      "formulae": ["kubernetes-cli", "helm"]
   },
   { "type": "aws-cli" },
   {
      "type": "aws-profile",
      "profile": "production",
      "awsAccessKeyId": "AKIA...",
      "awsSecretAccessKey": "TOP_SECRET"
   },
   {
      "type": "docker"
   },
   {
      "type": "ssh-key",
      "passphrase": ""
   },
   {
      "type": "terraform"
   }
]
```

### Shell Productivity Setup

```json
[
   {
      "type": "aliases",
      "aliases": [
         { "alias": "g", "value": "git" },
         { "alias": "d", "value": "docker" },
         { "alias": "k", "value": "kubectl" },
         { "alias": "tf", "value": "terraform" }
      ]
   },
   {
      "type": "path",
      "paths": [
         "$HOME/.local/bin",
         "$HOME/scripts"
      ]
   }
]
```

## Key Features

### Declarative Configuration
Define your desired system state and let Codify handle the implementation details.

### Idempotent Operations
Run `codify apply` as many times as you want - Codify only makes necessary changes.

### State Management
Codify tracks what it manages, allowing for clean modifications and removals.

### Cross-Platform
Most resources work on both macOS and Linux, with automatic OS detection.

### Modular Resources
Each resource is independent and can declare dependencies on others.

### Smart Diffs
Modify your configuration file and Codify will compute the minimal set of changes needed.

## Resource Modes

### Declarative Mode (Default)
Codify only manages what you explicitly declare. Other system state is ignored.

```json
{
  "type": "aliases",
  "aliases": [
    { "alias": "ll", "value": "ls -la" }
  ],
  "declarationsOnly": true
}
```

### Stateful Mode
Codify manages the complete state of a resource and tracks all changes.

```json
{
  "type": "homebrew",
  "formulae": ["git", "node"]
}
```
If you remove "node" from the config, Codify will uninstall it.

## Development

### Prerequisites

- Node.js >= 18.0.0
- TypeScript
- macOS or Linux

### Setup

```bash
# Clone the repository
git clone https://github.com/kevinwang5658/codify-homebrew-plugin.git
cd codify-homebrew-plugin

# Install dependencies
npm install

# Build the plugin
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run unit tests only (fast)
npm run test:unit

# Run integration tests only (slow, requires system access)
npm run test:integration

# Run a specific test
npx vitest test/shell/alias.test.ts
```

### Project Structure

```
src/
├── index.ts                    # Plugin entry point
├── resources/                  # Resource implementations
│   ├── homebrew/              # Homebrew package manager
│   ├── git/                   # Git resources
│   ├── shell/                 # Shell configuration
│   ├── python/                # Python tooling
│   └── ...                    # 50+ other resources
└── utils/                     # Shared utilities

test/                          # Integration tests
scripts/                       # Build and deployment scripts
```

## Contributing

We welcome contributions! Here's how to get started:

### Adding a New Resource

1. Create a new directory: `src/resources/category/resource-name/`
2. Create the resource class extending `Resource<ConfigType>`
3. Implement required lifecycle methods:
   - `getSettings()` - Define schema and configuration
   - `refresh()` - Read current system state
   - `create()` - Create the resource
   - `modify()` - Modify existing resource (optional)
   - `destroy()` - Remove the resource
4. Register your resource in `src/index.ts`
5. Add integration tests in `test/`
6. Submit a pull request

### Development Guidelines

- Use TypeScript strict mode
- Write tests for new resources (both unit and integration)
- Follow existing code patterns
- Use Zod schemas for new resources (preferred over JSON Schema)
- Handle both macOS and Linux where applicable
- Update documentation

### Testing Your Changes

Integration tests run against your actual system, so:
- Tests create and destroy real resources
- Use test accounts/directories when possible
- The test framework saves and restores shell configuration
- Some tests require specific tools (Xcode on macOS, etc.)

## Architecture

This plugin uses a **Resource-based architecture**:

- Each resource extends `Resource<ConfigType>` from `@codifycli/plugin-core`
- Resources implement a standard lifecycle: refresh → create/modify/destroy
- The framework handles state tracking, planning, and execution
- Resources can declare dependencies and OS compatibility
- Parameters can be simple, array-based, or fully stateful

For detailed architecture documentation, see [CLAUDE.md](CLAUDE.md).

## Building and Deploying

```bash
# Build for production
npm run build

# Deploy to registry (maintainers only)
npm run deploy

# Deploy beta version
npm run deploy:beta
```

The build process:
1. Compiles TypeScript with Rollup
2. Queries all resources for their schemas
3. Generates `dist/schemas.json` for validation
4. Bundles into a single distributable file

## License

ISC License - see [LICENSE](LICENSE) file for details.

## Links

- [Main Site](https://codifycli.com) - Official website
- [Codify CLI](https://github.com/codifycli/codify) - Main CLI tool
- [Plugin Core](https://github.com/codifycli/codify-plugin-core) - Plugin framework
- [Documentation](https://docs.codifycli.com) - Full documentation

## Support

- Open an [issue](https://github.com/codifycli/default-plugin/issues) for bug reports
- Submit [pull requests](https://github.com/codifycli/default-plugin/pulls) for contributions
- Star the project if you find it useful!

---

Made with ❤️ by the Codify community
