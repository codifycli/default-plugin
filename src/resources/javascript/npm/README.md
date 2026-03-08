---
title: npm
description: A reference page for the npm resource
sidebar:
  label: npm
---

The npm resource reference. This resource installs global npm packages.

## Parameters:

- **globalInstall**: *(array[string | \{ name: string, version: string \}])* An array of global packages to install. This array accepts
either the name of the package (installs the latest version) or an object with name and version.

## Example usage:

```json title="codify.json"
[
  {
    "type":  "npm",
    "globalInstall": [
      "typescript",
      {
        "name": "nodemon",
        "version": "3.1.10"
      }
    ]
  }
]
```
