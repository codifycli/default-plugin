---
title: tart
description: A reference page for the tart resource
sidebar:
  label: tart
---

The tart resource installs and manages tart, a macOS CLI application for managing macOS virtual machines similar to Docker. Tart allows you to create, run, and manage macOS VMs on Apple Silicon Macs.

## Parameters:

- **tart-home**: *(string)* The home directory of tart. This controls where the images are stored. To create this, simply add an entry to the rc file of the shell specifying the TART_HOME environment variable. Defaults to `~/.tart` if not specified.

- **login**: *(array)* The registries to login to. This is a stateful parameter that controls the login. Can be a string (host) or an object with host, username, and password.

- **clone**: *(string | object)* The image to clone. This is a stateful parameter that controls which images are cloned. Can be a string (clone directly) or an object with sourceName and name.

## Example usage:

Basic installation:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  }
]
```

Custom TART_HOME:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "tart-home": "~/my-tart-images"
  }
]
```

Login to a registry:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "login": ["ghcr.io"]
  }
]
```

Login with credentials:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "login": [
      {
        "host": "ghcr.io",
        "username": "my-username",
        "password": "my-password"
      }
    ]
  }
]
```

Clone an image:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "clone": ["ghcr.io/cirruslabs/macos-sonoma-base:latest"]
  }
]
```

Clone with custom name:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "clone": [
      {
        "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
        "name": "my-custom-vm"
      }
    ]
  }
]
```

Complete example:
```json title="codify.jsonc"
[
  {
    "type": "tart",
    "tart-home": "~/tart-images",
    "login": ["ghcr.io"],
    "clone": [
      {
        "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
        "name": "sonoma-vm"
      }
    ]
  }
]
```

## See also:

- [tart-vm](./tart-vm.md) - For managing individual VMs with custom configurations
