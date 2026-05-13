import { ExampleConfigs } from '@codifycli/plugin-core';

export const exampleSyncthingConfigs: ExampleConfigs = {
  example2: {
    title: 'Example Syncthing setup with two devices',
    description: 'Install Syncthing, register a peer device, and sync the ~/Documents folder between two machines.',
    configs: [
      {
        type: 'syncthing',
        launchAtStartup: true,
        globalAnnounceEnabled: true,
        localAnnounceEnabled: true,
        relaysEnabled: true,
        natEnabled: true,
        startBrowser: false,
        urAccepted: -1,
      },
      {
        type: 'syncthing-device',
        deviceId: '<Replace with peer device ID>',
        deviceName: 'My Second Machine',
        addresses: ['dynamic'],
        autoAcceptFolders: false,
        paused: false,
        compression: 'metadata',
      },
      {
        type: 'syncthing-folder',
        id: 'my-docs',
        path: '~/Documents',
        label: 'My Documents',
        folderType: 'sendreceive',
        devices: ['<Replace with peer device ID>'],
        fsWatcherEnabled: true,
        rescanIntervalS: 3600,
        maxConflicts: 10,
        paused: false,
      },
    ]
  },
}
