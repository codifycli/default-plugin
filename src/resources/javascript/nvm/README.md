---
title: nvm
description: A reference page for the nvm resource
sidebar:
  label: nvm
---
import { Steps } from "@astrojs/starlight/components";

The NVM resource reference. This resource will allow Codify to install NVM (node version manager). NVM allows
multiple different versions of NodeJS to live within the same system. It can also set a global version to be
active.

## Parameters:

- **global**: *(string)* The global version of node to use.

- **nodeVersions**: *(array[string])* Node versions to be installed.

## Example usage:

```json title="codify.json"
[
  {
    "type":  "nvm",
    "global": "18.20",
    "nodeVersions": [
      "18.20", "20.9.0", "16"
    ]
  }
]
```

### Setting up NodeJS

<Steps>
  1. Create a `codify.json` file anywhere.
  2. Open `codify.json` with your file editor and paste in the follow configs.
</Steps>

```json title="codify.json"
[
  {
    "type":  "nvm",
    "global": "20.9",
    "nodeVersions": [
      "20.9"
    ]
  }
]
```

<Steps>
  3. Run `codify apply` in the directory of the file. Open a new terminal and run the command `node -v` and
  `v20.9` should be returned. NodeJS is now installed and ready for use.
</Steps>

```sh title="codify.json"
codify apply
```
