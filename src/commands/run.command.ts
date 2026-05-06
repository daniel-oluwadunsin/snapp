import { exec, spawn } from "child_process";
import { snapp } from "../config/program";
import { Platform, SnappConfigFile } from "../types/snapp-config.types";
import {
  getBundleId,
  getDeepLinkPrefix,
  hasIOSDeviceBooted,
  parseAndroidDeviceIdentifiers,
  parseAndroidEmulatorAvds,
  parseIOSDeviceIdentifiers,
  parseIosDevices,
  readAndValidateConfigFile,
  resolveDeepLinkUrl,
  resolveScreenshotFilePath,
} from "../utils";
import { logger } from "../utils/logger";
import { cmds } from "../utils/cmd";
import {
  Device,
  RunConfig,
  RunSnappOptions,
  RunStatus,
} from "../types/run-snapp.types";
import { promisify } from "util";
import inquirer from "inquirer";
import { DEFAULT_SCREENSHOT_FORMAT } from "../constants";

const execAsync = promisify(exec);

snapp
  .command("run")
  .option(
    "--ios-device <iosDeviceUdid>",
    "UDID of the iOS device to run the app on",
  )
  .option(
    "--android-device <androidDeviceUdid>",
    "Alias of the Android device to run the app on",
  )
  .description("Run the app on a connected device or emulator")
  .action(runSnapp);

async function validateRunOptions(
  options: RunSnappOptions,
  config: SnappConfigFile,
) {
  if (options?.iosDeviceUDID && !config.project.platforms.ios) {
    logger.error(
      "iOS device specified but iOS platform is not enabled in config file.",
    );
    process.exit(1);
  }

  if (options?.androidDeviceUDID && !config.project.platforms.android) {
    logger.error(
      "Android device specified but Android platform is not enabled in config file.",
    );
    process.exit(1);
  }
}

async function getBootedDevices(platform: Platform): Promise<string[]> {
  // Run the appropriate command to get the list of booted devices for the given platform.
  // Parse the output to extract the device identifiers (e.g., UDIDs for iOS, serial numbers for Android).
  // Return an array of device identifiers.
  try {
    let deviceIdentifiers: string[] = [];

    const command =
      platform === "ios"
        ? cmds.getBootedDevices.ios
        : cmds.getBootedDevices.android;

    const { stdout, stderr } = await execAsync(command);

    if (stdout) {
      logger.info(`Booted ${platform} devices output: ${stdout}`);

      if (platform === "ios") {
        const parsedDevices = parseIOSDeviceIdentifiers(stdout);
        deviceIdentifiers = parsedDevices.active;
      } else {
        const parsedDevices = parseAndroidDeviceIdentifiers(stdout);
        deviceIdentifiers = parsedDevices.active;
      }
    }

    return deviceIdentifiers;
  } catch (error) {
    logger.error(
      `Error executing command to get booted ${platform} devices:`,
      error,
    );
    return [];
  }
}

async function getAllDevices(platform: Platform): Promise<string[]> {
  const command =
    platform === "ios" ? cmds.getAllDevices.ios : cmds.getAllDevices.android;

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      logger.error(
        `Error output while getting all ${platform} devices: ${stderr}`,
      );
      return [];
    }

    if (stdout) {
      if (platform === "ios") {
        const parsedDevices = parseIOSDeviceIdentifiers(stdout);
        return [...parsedDevices.active, ...parsedDevices.inactive];
      } else {
        const parsedDevices = parseAndroidEmulatorAvds(stdout);

        return parsedDevices;
      }
    }

    return [];
  } catch (error) {
    logger.error(
      `Error executing command to get all ${platform} devices:`,
      error,
    );
    return [];
  }
}

async function getAllAndSelectDevice(
  platform: Platform,
): Promise<Device | undefined> {
  const command =
    platform === "ios" ? cmds.getAllDevices.ios : cmds.getAllDevices.android;

  try {
    const { stdout, stderr } = await execAsync(command);

    if (stderr) {
      logger.error(
        `Error output while getting all ${platform} devices: ${stderr}`,
      );
      return undefined;
    }

    if (stdout) {
      logger.info(`All ${platform} devices output: ${stdout}`);
    }

    if (platform === "ios") {
      const devices = parseIosDevices(stdout);

      const deviceOptions = devices.map((device) => ({
        name: device.name || device.id,
        value: device.id,
      }));

      const selectedDeviceId = await inquirer
        .prompt({
          type: "select",
          name: "deviceId",
          message: `Select a ${platform} device:`,
          choices: deviceOptions,
        })
        .then((answers) => answers.deviceId);

      const selectedDevice = devices.find(
        (device) => device.id === selectedDeviceId,
      );

      return selectedDevice;
    } else if (platform === "android") {
      const devices = parseAndroidEmulatorAvds(stdout);

      const deviceOptions = devices.map((device) => ({
        name: device,
        value: device,
      }));

      const selectedDeviceName = await inquirer
        .prompt({
          type: "select",
          name: "deviceName",
          message: `Select a ${platform} device:`,
          choices: deviceOptions,
        })
        .then((answers) => answers.deviceName);

      const selectedDevice = devices.find(
        (device) => device === selectedDeviceName,
      );

      return selectedDevice ? { name: selectedDevice } : undefined;
    }

    return undefined;
  } catch (error) {
    logger.error(
      `Error executing command to get all ${platform} devices:`,
      error,
    );
    return undefined;
  }
}

async function waitForAndroidEmulatorStart(
  emulatorAvdName: string,
  timeoutMs: number,
): Promise<string> {
  const startTime = Date.now();
  const endTime = startTime + timeoutMs;

  let deviceStarted = false;
  let startedEmulatorId = undefined;

  while (!deviceStarted && Date.now() < endTime) {
    const { stderr, stdout } = await execAsync(cmds.getAndroidAdbs);

    if (stderr) {
      logger.error(`Error output while checking Android devices: ${stderr}`);
      process.exit(1);
    }

    if (stdout) {
      const parsedEmulators = parseAndroidDeviceIdentifiers(stdout);

      const runningEmulators = [
        ...parsedEmulators.active,
        ...parsedEmulators.inactive,
      ];

      for (const emulatorId of runningEmulators) {
        const { stderr, stdout } = await execAsync(
          cmds.getAndroidEmulatorAvd(emulatorId),
        );
        if (stderr) {
          logger.error(
            `Error output while checking Android emulator AVD for device ${emulatorId}: ${stderr}`,
          );
          continue;
        }

        if (stdout && stdout.includes(emulatorAvdName)) {
          deviceStarted = true;
          startedEmulatorId = emulatorId;
          break;
        }
      }
    }
  }

  return startedEmulatorId;
}

async function waitForDeviceBoot(
  platform: Platform,
  deviceId: string,
): Promise<boolean> {
  let deviceBooted = false;

  while (!deviceBooted) {
    const command =
      platform === "ios"
        ? cmds.checkBooted(deviceId).ios
        : cmds.checkBooted(deviceId).android;

    try {
      if (platform === "ios") {
        const { stdout } = await execAsync(cmds.checkBooted(deviceId).ios);

        if (stdout) deviceBooted = true;
      }

      if (platform === "android") {
        await execAsync(cmds.waitForAndroidDevice);

        const { stdout } = await execAsync(cmds.checkBooted(deviceId).android);

        if (stdout && stdout.trim() === "1") {
          deviceBooted = true;
        }
      }
    } catch (error: any) {
      logger.error(
        `Error executing command to check if ${platform} device ${deviceId} is booted:`,
        error,
      );
      return false;
    }
  }

  return deviceBooted;
}

async function launchSimulator(
  platform: Platform,
  deviceId: string,
): Promise<boolean> {
  if (platform === "ios") {
    const command = cmds.launchSimulator(deviceId).ios;
    try {
      const { stderr } = await execAsync(command);
      logger.info(`Launched iOS simulator with device ID: ${deviceId}`);

      if (stderr) {
        logger.error(
          `Error output while launching iOS simulator with device ID ${deviceId}: ${stderr}`,
        );
        process.exit(1);
      }

      return true;
    } catch (error) {
      logger.error(
        `Error launching iOS simulator with device ID ${deviceId}:`,
        error,
      );
      process.exit(1);
    }
  }

  if (platform === "android") {
    const command = cmds.launchSimulator(deviceId).android;

    const spawnCommand = command.split(" ")[0];
    const spawnArgs = command.split(" ").slice(1);

    // should be a non-blocking call that launches the emulator and returns immediately
    const emulatorProcess = spawn(spawnCommand, spawnArgs, {
      detached: true,
      stdio: "ignore",
    });

    emulatorProcess.unref();

    return true;
  }

  return false;
}

async function launchIOSSimunlatorAndGetDeviceUDID(
  defaultIosDeviceUDID?: string,
): Promise<string> {
  let iosDeviceUDID = "";
  const spinner = logger.startSpinner("Checking for booted iOS devices...");

  const bootedIosDevices = await getBootedDevices("ios");

  if (!defaultIosDeviceUDID) {
    if (bootedIosDevices.length === 0) {
      logger.stopSpinner(spinner, undefined, "No booted iOS devices found.");
    } else {
      iosDeviceUDID = bootedIosDevices[0];
      logger.stopSpinner(
        spinner,
        `Using booted iOS device: ${bootedIosDevices[0]}`,
      );
    }
  }

  if (!iosDeviceUDID) {
    const devices = await getAllDevices("ios");
    let _iosDeviceUDID = "";

    if (defaultIosDeviceUDID && !devices.includes(defaultIosDeviceUDID)) {
      logger.error(
        `Specified iOS device '${defaultIosDeviceUDID}' not found among available devices.`,
      );
      process.exit(1);
    }

    _iosDeviceUDID =
      defaultIosDeviceUDID ||
      (await getAllAndSelectDevice("ios")?.then((d) => d?.id)) ||
      devices[0];

    if (!_iosDeviceUDID) {
      logger.error("No iOS devices found to launch.");
      process.exit(1);
    }

    const spinner = logger.startSpinner(
      `Waiting for iOS device '${_iosDeviceUDID}' to boot...`,
    );

    const launched = await launchSimulator("ios", _iosDeviceUDID);

    if (launched) {
      const booted = await waitForDeviceBoot("ios", _iosDeviceUDID);

      if (booted) {
        iosDeviceUDID = _iosDeviceUDID;
        logger.stopSpinner(
          spinner,
          `iOS device '${_iosDeviceUDID}' is now booted and ready.`,
        );
      } else {
        logger.stopSpinner(
          spinner,
          undefined,
          `Failed to boot iOS device '${_iosDeviceUDID}' within the expected time.`,
        );
        process.exit(1);
      }
    } else {
      logger.stopSpinner(
        spinner,
        undefined,
        `Failed to launch iOS device '${_iosDeviceUDID}'.`,
      );
      process.exit(1);
    }
  }

  return iosDeviceUDID;
}

async function launchAndroidEmulatorAndGetDeviceUDID(
  defaultAndroidDeviceUDID?: string,
): Promise<string> {
  let androidDeviceUDID = "";
  const spinner = logger.startSpinner("Checking for booted Android devices...");

  const bootedAndroidDevices = await getBootedDevices("android");

  if (!defaultAndroidDeviceUDID) {
    if (bootedAndroidDevices.length === 0) {
      logger.stopSpinner(
        spinner,
        undefined,
        "No booted Android devices found.",
      );
    } else {
      androidDeviceUDID = bootedAndroidDevices[0];
      logger.stopSpinner(
        spinner,
        `Using booted Android device: ${bootedAndroidDevices[0]}`,
      );
    }
  } else {
    if (bootedAndroidDevices.includes(defaultAndroidDeviceUDID)) {
      androidDeviceUDID = defaultAndroidDeviceUDID;
      logger.stopSpinner(
        spinner,
        `Using specified Android device: ${defaultAndroidDeviceUDID}`,
      );
    } else {
      logger.stopSpinner(
        spinner,
        undefined,
        `Specified Android device '${defaultAndroidDeviceUDID}' is not booted yet.`,
      );
    }
  }

  if (!androidDeviceUDID) {
    const devices = await getAllDevices("android");
    let androidDeviceUDID = "";

    if (
      defaultAndroidDeviceUDID &&
      !devices.includes(defaultAndroidDeviceUDID)
    ) {
      logger.error(
        `Specified Android device '${defaultAndroidDeviceUDID}' not found among available devices.`,
      );
      process.exit(1);
    }

    // at this point, this is just the avd name, not the running emulator id
    // E.G PIXEL_5_API_34
    // running emulator id example is: emulator-5554
    androidDeviceUDID =
      defaultAndroidDeviceUDID ||
      (await getAllAndSelectDevice("android")?.then((d) => d?.name)) ||
      devices[0];

    if (!androidDeviceUDID) {
      logger.error("No Android devices found to launch.");
      process.exit(1);
    }

    const spinner = logger.startSpinner(
      `Waiting for Android device '${androidDeviceUDID}' to boot...`,
    );

    const launched = await launchSimulator("android", androidDeviceUDID);

    if (launched) {
      const startedDeviceId = await waitForAndroidEmulatorStart(
        androidDeviceUDID,
        120000,
      );

      if (startedDeviceId) {
        const booted = await waitForDeviceBoot("android", startedDeviceId);

        if (booted) {
          androidDeviceUDID = startedDeviceId;

          logger.stopSpinner(
            spinner,
            `Android device '${androidDeviceUDID}' is now booted and ready.`,
          );
        } else {
          logger.stopSpinner(
            spinner,
            undefined,
            `Failed to boot Android device '${androidDeviceUDID}' within the expected time.`,
          );
          process.exit(1);
        }
      } else {
        logger.stopSpinner(
          spinner,
          undefined,
          `Failed to start Android emulator with device ID '${androidDeviceUDID}' within the expected time.`,
        );
        process.exit(1);
      }
    } else {
      logger.stopSpinner(
        spinner,
        undefined,
        `Failed to launch Android device '${androidDeviceUDID}'.`,
      );
      process.exit(1);
    }
  }

  return androidDeviceUDID;
}

async function runAppOnDevice(
  platform: Platform,
  deviceId: string,
  config: SnappConfigFile,
): Promise<boolean> {
  const bundleId = config.project.bundleId as string;

  let command = config.commands?.run
    ? platform === "ios"
      ? config.commands?.run?.ios
      : config.commands?.run?.android
    : undefined;

  if (!command) {
    // if using default xcode and adb run commands, we expect the app to already be installed on the device. If it's not, the command will fail and we'll log an error about the app not being installed, rather than trying to install it ourselves
    const appInstalled = await checkAppInstalled(platform, deviceId, bundleId);

    if (!appInstalled) {
      logger.error(
        `App with bundle ID '${bundleId}' is not installed on ${platform} device '${deviceId}'. Please install the app and try again.`,
      );
      process.exit(1);
    }

    command =
      platform === "ios"
        ? cmds.runApp(bundleId, deviceId).ios
        : cmds.runApp(bundleId, deviceId).android;
  }

  try {
    const commandExecutable = command.split(" ")[0];
    const commandArgs = command.split(" ").slice(1);

    const runCommandRef = spawn(commandExecutable, commandArgs, {
      stdio: "ignore",
      detached: true,
    });

    runCommandRef.unref();

    return true;
  } catch (error) {
    logger.error(
      `Error executing command ${command} to run app on ${platform} device ${deviceId}:`,
      error,
    );
    return false;
  }
}

async function pollAppLaunched(
  platform: Platform,
  deviceId: string,
  config: SnappConfigFile,
): Promise<boolean> {
  const runTimeout = config.runtime?.timeoutMs || 120000;
  const startTime = Date.now();
  const endTime = startTime + runTimeout;

  const bundleId = config.project.bundleId as string;

  const appRunningCommand =
    platform === "ios"
      ? cmds.checkAppRunning(bundleId, deviceId).ios
      : cmds.checkAppRunning(bundleId, deviceId).android;

  const appRunningInForegroundCommand =
    platform === "ios"
      ? cmds.checkAppRunningInForeGround(bundleId, deviceId).ios
      : cmds.checkAppRunningInForeGround(bundleId, deviceId).android;

  if (platform === "android") {
    // for android, we first check if the app process is running at all, then check if it's in the foreground
    let appRunning = false;
    let appInForeground = false;

    while (Date.now() < endTime && !appInForeground) {
      try {
        const { stdout } = await execAsync(appRunningCommand);

        if (stdout) {
          appRunning = true;

          const { stdout: foregroundStdout } = await execAsync(
            appRunningInForegroundCommand,
          );

          if (foregroundStdout && foregroundStdout.includes(bundleId)) {
            appInForeground = true;
            break;
          }
        }
      } catch (error) {}
    }

    if (appRunning && appInForeground) {
      return true;
    }
  } else {
    // forground and background check is the same for iOS, so we just check if the app is running
    while (Date.now() < endTime) {
      try {
        const { stdout } = await execAsync(appRunningCommand);

        if (stdout && stdout.includes(bundleId)) {
          return true;
        }
      } catch (error) {}
    }
  }

  // if it gets here, it means the app did not launch within the expected time
  logger.error(
    `App did not launch on ${platform} device ${deviceId} within the expected time of ${
      runTimeout / 1000
    } seconds.`,
  );

  return false;
}

async function checkAppInstalled(
  platform: Platform,
  deviceId: string,
  bundleId: string,
): Promise<boolean> {
  const command =
    platform === "ios"
      ? cmds.checkAppInstalled(bundleId, deviceId).ios
      : cmds.checkAppInstalled(bundleId, deviceId).android;

  try {
    const { stdout } = await execAsync(command);

    if (stdout) {
      return true;
    }
  } catch (error) {}

  return false;
}

async function startAppOnDevice(
  platform: Platform,
  deviceId: string,
  config: SnappConfigFile,
): Promise<void> {
  const spinner = logger.startSpinner(
    `Launching app on ${platform} device '${deviceId}'...`,
  );

  config.project.bundleId = getBundleId(config.project.bundleId, platform);

  await runAppOnDevice(platform, deviceId, config);

  const appLaunched = await pollAppLaunched(platform, deviceId, config);

  if (!appLaunched) {
    logger.stopSpinner(
      spinner,
      undefined,
      undefined,
      `Failed to detect app launch on ${platform} device '${deviceId}'.`,
    );
    process.exit(1);
  }

  logger.stopSpinner(
    spinner,
    `App successfully launched on ${platform} device '${deviceId}'.`,
  );
}

async function openDeepLink(
  platform: Platform,
  deviceId: string,
  url: string,
  bundleId: string,
) {
  const command =
    platform === "ios"
      ? cmds.openDeepLink(url, deviceId).ios
      : cmds.openDeepLink(url, deviceId).android;

  const confirmAppOpenedCommand =
    platform === "ios"
      ? cmds.checkAppRunningInForeGround(bundleId, deviceId).ios
      : cmds.checkAppRunningInForeGround(bundleId, deviceId).android;

  try {
    await execAsync(command);

    // we can check if the app is in foreground to confirm that the deep link was opened successfully, if after opening the deep link, the app is not in foreground, it might indicate that the deep link failed to open the app
    const { stdout } = await execAsync(confirmAppOpenedCommand);

    if (stdout && stdout.includes(bundleId)) {
      logger.info(
        `Successfully opened deep link '${url}' on ${platform} device '${deviceId}'.`,
      );
    } else {
      logger.error(
        `Failed to open deep link '${url}' on ${platform} device '${deviceId}'. App did not come to foreground as expected.`,
      );
    }
  } catch (error) {
    logger.error(
      `Error executing command to open deep link '${url}' on ${platform} device '${deviceId}':`,
      error,
    );
  }
}

async function captureScreenshot(
  platform: Platform,
  deviceId: string,
  config: SnappConfigFile,
) {
  const bundleId = getBundleId(config.project.bundleId, platform);
  const spinner = logger.startSpinner(
    `Capturing screenshots on ${platform} device '${deviceId}'...`,
  );

  for (let i = 0; i < config.screens.length; i++) {
    const screen = config.screens[i];

    const deepLinkUrl = resolveDeepLinkUrl(
      getDeepLinkPrefix(config.deepLinks.prefix, platform),
      screen.url,
    );

    await openDeepLink(platform, deviceId, deepLinkUrl, bundleId);

    if (screen.waitFor?.type === "timeout" && screen.waitFor.value) {
      const screenName = screen.name || `screen-${i + 1}`;

      logger.info(
        `Waiting for ${screen.waitFor.value} ms before capturing screenshot for screen '${screenName}'...`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Number(screen.waitFor.value)),
      );
    }

    const fileFormat = config.output.format || DEFAULT_SCREENSHOT_FORMAT;

    const fileName = `${screen.screenshot?.fileName || `screenshot-${i + 1}`}.${fileFormat}`;

    const screenName = screen.name || `screen-${i + 1}`;

    const filePath = resolveScreenshotFilePath(
      platform,
      fileName,
      screenName,
      config,
    );

    const command =
      platform === "ios"
        ? cmds.screenshot(deviceId, filePath).ios
        : cmds.screenshot(deviceId, filePath).android;

    try {
      console.log(
        `Executing command to capture screenshot for screen '${screenName}': ${command}`,
      );
      const { stdout } = await execAsync(command);

      console.log(stdout);

      logger.info(
        `Captured screenshot for screen '${screen.name}' on ${platform} device '${deviceId}' at path: ${filePath}`,
      );
    } catch (error) {
      logger.error(
        `Error capturing screenshot for screen '${screen.name}' on ${platform} device '${deviceId}':`,
        error,
      );
    }
  }

  logger.stopSpinner(
    spinner,
    `Finished capturing screenshots on ${platform} device '${deviceId}'.`,
  );

  process.exit(0);
}

async function runSnapp(options?: RunSnappOptions) {
  const config = await readAndValidateConfigFile();
  const runConfigs: RunConfig = {};

  await validateRunOptions(options || {}, config);

  if (config.project.platforms.ios) {
    runConfigs.iosDeviceUDID = await launchIOSSimunlatorAndGetDeviceUDID(
      options.iosDeviceUDID,
    );

    await startAppOnDevice("ios", runConfigs.iosDeviceUDID!, config);

    if (config.runtime.delayAfterLaunchMs) {
      logger.info(
        `Starting screenshot capture in ${config.runtime.delayAfterLaunchMs} ms...`,
      );

      setTimeout(() => {
        captureScreenshot("ios", runConfigs.iosDeviceUDID!, config);
      }, config.runtime.delayAfterLaunchMs);
    } else {
      captureScreenshot("ios", runConfigs.iosDeviceUDID!, config);
    }
  }

  if (config.project.platforms.android) {
    runConfigs.androidDeviceUDID = await launchAndroidEmulatorAndGetDeviceUDID(
      options.androidDeviceUDID,
    );

    await startAppOnDevice("android", runConfigs.androidDeviceUDID!, config);

    if (config.runtime.delayAfterLaunchMs) {
      logger.info(
        `Starting screenshot capture in ${config.runtime.delayAfterLaunchMs} ms...`,
      );

      setTimeout(() => {
        captureScreenshot("android", runConfigs.androidDeviceUDID!, config);
      }, config.runtime.delayAfterLaunchMs);
    } else {
      captureScreenshot("android", runConfigs.androidDeviceUDID!, config);
    }
  }
}
