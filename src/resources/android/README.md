---
title: android-studio
description: A reference page for the Android Studios resource
sidebar:
  label: android-studio
---

The Android Studio resource installs Android Studios. It supports the current and all previous versions.
It also allows preview and beta versions to be installed.

## Parameters:

- **version**: *(string)* The version to install. This will default to the latest stable version if it isn't
specified. For a list of all available versions please see: https://developer.android.com/studio/archive.

- **directory**: *(string)* A custom directory to install Android Studios to. This defaults to `/Applications`
if left unspecified

## Example usage:

Stable version:
```json title="codify.jsonc"
[
  {
    "type": "Android Studio"
  }
]
```

Stable and previous version:
```json title="codify.jsonc"
[
  {
    "type": "Android Studio"
  },
  {
    "type": "Android Studio",
    "version": "2024.2.1.8"
  }
]
```

Custom directory:
```json title="codify.jsonc"
[
  {
    "type": "Android Studio",
    "version": "2024.2.1.7",
    "directory": "~/programs"
  }
]
```
