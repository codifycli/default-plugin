---
title: tart-vm
description: A reference page for the tart-vm resource
sidebar:
  label: tart-vm
---

The tart-vm resource manages individual tart virtual machines. It allows you to clone specific VMs from OCI registries and configure their settings such as memory, CPU, display size, and disk size.

## Parameters:

- **sourceName**: *(string)* The source of the image (an OCI registry). This is required.

- **name**: *(string)* The local name of the image. If not specified, the name will be derived from the sourceName.

- **memory**: *(number)* Sets the memory of the VM in MB using `tart set <vm-name> --memory`.

- **cpu**: *(number)* Sets the CPU count of the VM using `tart set <vm-name> --cpu`.

- **display**: *(string)* Sets the display size in format `<width>x<height>`. For example `1200x800`.

- **disk**: *(string)* The location of the disk, which is a path.

- **disk-size**: *(number)* The disk size in GB. Disk size can only be increased and not decreased.

## Example usage:

Basic VM creation:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest"
  }
]
```

VM with custom name:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
    "name": "my-sonoma-vm"
  }
]
```

VM with memory and CPU:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
    "name": "dev-vm",
    "memory": 8192,
    "cpu": 4
  }
]
```

VM with display settings:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
    "name": "dev-vm",
    "display": "1920x1080"
  }
]
```

VM with disk size:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
    "name": "dev-vm",
    "disk-size": 100
  }
]
```

Complete VM configuration:
```json title="codify.jsonc"
[
  {
    "type": "tart"
  },
  {
    "type": "tart-vm",
    "sourceName": "ghcr.io/cirruslabs/macos-sonoma-base:latest",
    "name": "development-vm",
    "memory": 16384,
    "cpu": 8,
    "display": "2560x1440",
    "disk-size": 200
  }
]
```

## See also:

- [tart](./tart.md) - For installing and managing tart itself
