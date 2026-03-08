---
title: pnpm
description: A reference page for the pnpm resource
sidebar:
  label: pnpm
---
import {Aside} from "@astrojs/starlight/components";

The pnpm resource is responsible for installing, configuring and destroying
pnpm. Using the `globalEnvNodeVersion` the pnpm resource is able to install
a global version of NodeJS using the `pnpm env use --global` command.

<Aside type='caution'>The `globalEnvNodeVersion` parameter may not work if Node was already installed using some other means (like nvm).</Aside>

## Parameters:

- **version**: *(string)* The version of pnpm to install (defaults to latest).

- **globalEnvNodeVersion**: *(string)* Set the global node version. Corresponds to `pnpm env --global use`

## Example usage:

```json title="codify.json"
[
  {
    "type":  "pnpm",
    "globalEnvNodeVersion": "20"
  }
]
```

In this example, pnpm will be installed and then using the command `pnpm env --global use`,
Codify will install NodeJs version 20 onto the system.
