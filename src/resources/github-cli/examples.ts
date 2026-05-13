import { ExampleConfig } from '@codifycli/plugin-core';

export const exampleGithubCliBasic: ExampleConfig = {
  title: 'Install GitHub CLI with SSH configuration',
  description: 'Install gh and configure it to use SSH for git operations and vim as the default editor.',
  configs: [
    {
      type: 'github-cli',
      gitProtocol: 'ssh',
      editor: 'vim',
    },
  ],
};

export const exampleGithubCliFull: ExampleConfig = {
  title: 'Full GitHub CLI setup with authentication',
  description: 'Install gh, authenticate with a personal access token, and configure SSH as the default git protocol.',
  configs: [
    {
      type: 'github-cli',
      gitProtocol: 'ssh',
    },
    {
      type: 'github-cli-auth',
      token: '<Replace me here!>',
    },
  ],
};

export const exampleGithubCliAuthBasic: ExampleConfig = {
  title: 'Authenticate GitHub CLI with a token',
  description: 'Log in to GitHub using a personal access token for non-interactive environments.',
  configs: [
    {
      type: 'github-cli-auth',
      token: '<Replace me here!>',
    },
  ],
};

export const exampleGithubCliAuthEnterprise: ExampleConfig = {
  title: 'Authenticate to GitHub Enterprise',
  description: 'Log in to a self-hosted GitHub Enterprise Server instance with a PAT.',
  configs: [
    {
      type: 'github-cli',
    },
    {
      type: 'github-cli-auth',
      token: '<Replace me here!>',
      hostname: 'github.mycompany.com',
    },
  ],
};

export const exampleGithubCliAliasBasic: ExampleConfig = {
  title: 'Add a gh CLI alias',
  description: 'Create a short alias "prc" that expands to "pr create" for faster pull request creation.',
  configs: [
    {
      type: 'github-cli-alias',
      alias: 'prc',
      expansion: 'pr create',
    },
  ],
};

export const exampleGithubCliAliasShell: ExampleConfig = {
  title: 'Full GitHub CLI setup with aliases',
  description: 'Install gh, authenticate, and set up handy aliases for common workflows.',
  configs: [
    {
      type: 'github-cli',
    },
    {
      type: 'github-cli-auth',
      token: '<Replace me here!>',
    },
    {
      type: 'github-cli-alias',
      alias: 'prc',
      expansion: 'pr create',
    },
    {
      type: 'github-cli-alias',
      alias: 'prs',
      expansion: 'pr status',
    },
  ],
};

export const exampleGithubCliSshKeyBasic: ExampleConfig = {
  title: 'Upload SSH key to GitHub',
  description: 'Register an existing local SSH public key with your GitHub account for authentication.',
  configs: [
    {
      type: 'github-cli-ssh-key',
      title: 'My Laptop',
      keyFile: '~/.ssh/id_ed25519.pub',
    },
  ],
};

export const exampleGithubCliSshKeyFull: ExampleConfig = {
  title: 'Full SSH key setup for GitHub',
  description: 'Install gh, authenticate, then upload a local SSH key to your GitHub account.',
  configs: [
    {
      type: 'github-cli',
    },
    {
      type: 'github-cli-auth',
      token: '<Replace me here!>',
    },
    {
      type: 'github-cli-ssh-key',
      title: 'My Laptop',
      keyFile: '~/.ssh/id_ed25519.pub',
      keyType: 'authentication',
    },
  ],
};
