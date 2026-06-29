// Known Android hardware profiles from the AVD Manager device definitions.
// These correspond to profiles accepted by `android emulator create --profile=<name>`.
export default async function loadAndroidEmulatorProfiles(): Promise<string[]> {
  return [
    // Generic form factors
    'medium_phone',
    'small_phone',
    'foldable',
    'medium_tablet',
    'resizable',
    'desktop_medium',

    // Pixel phones
    'pixel_9',
    'pixel_9_pro',
    'pixel_9_pro_xl',
    'pixel_9_pro_fold',
    'pixel_8',
    'pixel_8_pro',
    'pixel_7',
    'pixel_7_pro',
    'pixel_7a',
    'pixel_6',
    'pixel_6_pro',
    'pixel_6a',
    'pixel_5',
    'pixel_4',
    'pixel_4_xl',
    'pixel_4a',
    'pixel_3',
    'pixel_3_xl',
    'pixel_3a',
    'pixel_3a_xl',

    // Pixel tablets / foldables
    'pixel_tablet',
    'pixel_fold',

    // Wear OS
    'wear_os_large_round',
    'wear_os_small_round',
    'wear_os_square',
    'wear_os_rect',

    // Android TV
    'tv_1080p',
    'tv_720p',
    'tv_4k',

    // Automotive
    'automotive_1024p_landscape',
    'automotive_portrait',
  ];
}
