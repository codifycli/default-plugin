// Known Android hardware profiles from the AVD Manager device definitions.
// These correspond to profiles accepted by `android emulator create --profile=<name>`.
export default async function loadAndroidEmulatorProfiles(): Promise<string[]> {
  return [
    'large_desktop',
    'medium_desktop',
    'medium_phone',
    'medium_tablet',
    'small_desktop',
    'small_phone',
  ];
}
