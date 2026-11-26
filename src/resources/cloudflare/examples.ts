import { ExampleConfig } from '@codifycli/plugin-core';

export const exampleDeployNewSite: ExampleConfig = {
  title: 'Deploy a new Astro site to Cloudflare',
  description: 'Install Node.js and wrangler, log in to Cloudflare in the browser, scaffold an Astro site and deploy it to a free workers.dev URL. No domain needed.',
  configs: [
    { type: 'nvm', nodeVersions: ['lts'], global: 'lts' },
    { type: 'wrangler' },
    { type: 'wrangler-auth' },
    {
      type: 'cloudflare-worker',
      workerName: 'my-site',
      directory: '~/projects/my-site',
      framework: 'astro',
    },
  ],
};

export const exampleDeployExistingSite: ExampleConfig = {
  title: 'Deploy an existing site from GitHub',
  description: 'Clone a site, install its dependencies and deploy it to Cloudflare. wrangler detects the framework and adds a Cloudflare config when the project has none.',
  configs: [
    { type: 'nvm', nodeVersions: ['lts'], global: 'lts' },
    { type: 'wrangler' },
    { type: 'wrangler-auth' },
    { type: 'git-repository', repository: 'https://github.com/<Replace me here!>.git', directory: '~/projects/my-site' },
    { type: 'project-install', directory: '~/projects/my-site' },
    { type: 'cloudflare-worker', workerName: 'my-site', directory: '~/projects/my-site' },
  ],
};

export const exampleWranglerBasic: ExampleConfig = {
  title: 'Install wrangler with Node.js',
  description: 'Install the Node.js LTS with nvm (wrangler needs Node.js 22.12 or newer), then install the wrangler CLI globally.',
  configs: [
    { type: 'nvm', nodeVersions: ['lts'], global: 'lts' },
    { type: 'wrangler' },
  ],
};

export const exampleWranglerAuthDevice: ExampleConfig = {
  title: 'Log in to Cloudflare from a VM or SSH session',
  description: 'Use the device code flow, which works where the browser can\'t reach the machine, and keep the credentials in the OS keychain.',
  configs: [
    { type: 'wrangler' },
    { type: 'wrangler-auth', device: true, useKeyring: true },
  ],
};
