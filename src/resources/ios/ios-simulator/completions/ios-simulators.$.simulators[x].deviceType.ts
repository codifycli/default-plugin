// Known CoreSimulator device type identifiers shipped with Xcode.
// These identifiers are stable across Xcode versions for each device family.
export default async function loadIosSimulatorDeviceTypes(): Promise<string[]> {
  return [
    // iPhone SE
    'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation',

    // iPhone 14 family
    'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-14-Plus',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-14-Pro',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-14-Pro-Max',

    // iPhone 15 family
    'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Plus',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro-Max',

    // iPhone 16 family
    'com.apple.CoreSimulator.SimDeviceType.iPhone-16',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Plus',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',
    'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max',

    // iPad mini
    'com.apple.CoreSimulator.SimDeviceType.iPad-mini-6th-generation',
    'com.apple.CoreSimulator.SimDeviceType.iPad-mini-A17-Pro',

    // iPad Air
    'com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation',
    'com.apple.CoreSimulator.SimDeviceType.iPad-Air-11-inch-M2',
    'com.apple.CoreSimulator.SimDeviceType.iPad-Air-13-inch-M2',

    // iPad Pro 11-inch
    'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-4th-generation',
    'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4',

    // iPad Pro 12.9 / 13-inch
    'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-12-9-inch-6th-generation',
    'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4',

    // Apple Watch
    'com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-9-41mm',
    'com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-9-45mm',
    'com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Ultra-2-49mm',

    // Apple TV
    'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-4K',
    'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K-3rd-generation-1080p',

    // Apple Vision Pro
    'com.apple.CoreSimulator.SimDeviceType.Apple-Vision-Pro',
  ];
}
