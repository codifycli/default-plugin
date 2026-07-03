// Known CoreSimulator runtime identifiers. Each entry corresponds to an iOS
// (or watchOS/tvOS/visionOS) runtime that can be installed via Xcode.
export default async function loadIosSimulatorRuntimes(): Promise<string[]> {
  return [
    // iOS
    'com.apple.CoreSimulator.SimRuntime.iOS-16-0',
    'com.apple.CoreSimulator.SimRuntime.iOS-16-1',
    'com.apple.CoreSimulator.SimRuntime.iOS-16-2',
    'com.apple.CoreSimulator.SimRuntime.iOS-16-4',
    'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
    'com.apple.CoreSimulator.SimRuntime.iOS-17-2',
    'com.apple.CoreSimulator.SimRuntime.iOS-17-4',
    'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
    'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
    'com.apple.CoreSimulator.SimRuntime.iOS-18-1',
    'com.apple.CoreSimulator.SimRuntime.iOS-18-2',
    'com.apple.CoreSimulator.SimRuntime.iOS-18-3',
    'com.apple.CoreSimulator.SimRuntime.iOS-18-4',

    // watchOS
    'com.apple.CoreSimulator.SimRuntime.watchOS-10-0',
    'com.apple.CoreSimulator.SimRuntime.watchOS-10-4',
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-0',
    'com.apple.CoreSimulator.SimRuntime.watchOS-11-2',

    // tvOS
    'com.apple.CoreSimulator.SimRuntime.tvOS-17-0',
    'com.apple.CoreSimulator.SimRuntime.tvOS-17-4',
    'com.apple.CoreSimulator.SimRuntime.tvOS-18-0',
    'com.apple.CoreSimulator.SimRuntime.tvOS-18-2',

    // visionOS
    'com.apple.CoreSimulator.SimRuntime.xrOS-1-0',
    'com.apple.CoreSimulator.SimRuntime.xrOS-1-2',
    'com.apple.CoreSimulator.SimRuntime.xrOS-2-0',
    'com.apple.CoreSimulator.SimRuntime.xrOS-2-2',
  ];
}
