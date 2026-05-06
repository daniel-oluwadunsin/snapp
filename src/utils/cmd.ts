export const cmds = {
  getAndroidAdbs: "adb devices", // emulator-5554   device
  getAndroidEmulatorAvd(emulatorId: string) {
    return `adb -s ${emulatorId} emu avd name`;
  },
  waitForAndroidDevice: "adb wait-for-device",

  getAllDevices: {
    ios: "xcrun simctl list devices", // iPhone 15 Pro (A1B2C3D4-1234-5678-9ABC-DEF012345678) (Booted)
    android: "emulator -list-avds", // List of available Android emulators (not necessarily booted)
  },

  getBootedDevices: {
    ios: "xcrun simctl list devices booted", // iPhone 15 Pro (A1B2C3D4-1234-5678-9ABC-DEF012345678) (Booted)
    // return empty string if grep fails
    android: `adb devices | grep -w "device" || true`, // emulator-5554   device
  },

  launchSimulator(deviceId: string) {
    return {
      ios: `xcrun simctl boot ${deviceId} && open -a Simulator`,
      android: `emulator -avd ${deviceId}`,
    };
  },

  checkBooted(deviceId: string) {
    return {
      ios: `xcrun simctl bootstatus ${deviceId} -b`, // launch home screen to check
      android: `adb -s ${deviceId} shell getprop sys.boot_completed`, // returns "1" if booted, empty if not
    };
  },

  runApp(bundleId: string, deviceId: string) {
    return {
      ios: `xcrun simctl launch ${deviceId} ${bundleId}`,
      android: `adb -s ${deviceId} shell monkey -p ${bundleId} -c android.intent.category.LAUNCHER 1`,
    };
  },

  checkAppRunningInForeGround(bundleId: string, deviceId: string) {
    return {
      android: `adb -s ${deviceId} shell dumpsys window | grep mCurrentFocus`,
      ios: `xcrun simctl spawn ${deviceId} launchctl list | grep ${bundleId}`,
    };
  },

  checkAppRunning(bundleId: string, deviceId: string) {
    return {
      android: `adb -s ${deviceId} shell pidof ${bundleId}`,
      ios: `xcrun simctl spawn ${deviceId} launchctl list | grep ${bundleId}`,
    };
  },

  checkAppInstalled(bundleId: string, deviceId: string) {
    return {
      android: `adb -s ${deviceId} shell pm list packages | grep ${bundleId}`,
      ios: `xcrun simctl get_app_container ${deviceId} ${bundleId}`,
    };
  },
};
