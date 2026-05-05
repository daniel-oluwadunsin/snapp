import { exec, spawn } from "child_process";
import { snapp } from "../config/program";
import { Platform } from "../types/snapp-config.types";
import {
  hasIOSDeviceBooted,
  parseAndroidDeviceIdentifiers,
  parseAndroidEmulatorAvds,
  parseIOSDeviceIdentifiers,
  readAndValidateConfigFile,
} from "../utils";
import { logger } from "../utils/logger";
import { cmds } from "../utils/cmd";
import { RunConfig, RunSnappOptions } from "../types/run-snapp.types";
import { promisify } from "util";

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
      logger.info(`All ${platform} devices output: ${stdout}`);

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

async function runSnapp(options?: RunSnappOptions) {
  const config = await readAndValidateConfigFile();
  const runConfigs: RunConfig = {};

  if (config.project.platforms.ios) {
    const spinner = logger.startSpinner("Checking for booted iOS devices...");

    const bootedIosDevices = await getBootedDevices("ios");

    if (!options.iosDeviceUDID) {
      if (bootedIosDevices.length === 0) {
        logger.stopSpinner(spinner, undefined, "No booted iOS devices found.");
      } else {
        runConfigs.iosDeviceUDID = bootedIosDevices[0];
        logger.stopSpinner(
          spinner,
          `Using booted iOS device: ${bootedIosDevices[0]}`,
        );
      }
    } else {
      if (bootedIosDevices.includes(options.iosDeviceUDID)) {
        runConfigs.iosDeviceUDID = options.iosDeviceUDID;
        logger.stopSpinner(
          spinner,
          `Using specified iOS device: ${options.iosDeviceUDID}`,
        );
      } else {
        logger.stopSpinner(
          spinner,
          undefined,
          `Specified iOS device '${options.iosDeviceUDID}' is not booted yet.`,
        );
      }
    }

    if (!runConfigs.iosDeviceUDID) {
      const devices = await getAllDevices("ios");
      let iosDeviceUDID = "";

      if (options?.iosDeviceUDID && !devices.includes(options.iosDeviceUDID)) {
        logger.error(
          `Specified iOS device '${options.iosDeviceUDID}' not found among available devices.`,
        );
        process.exit(1);
      }

      iosDeviceUDID = options?.iosDeviceUDID || devices[0];

      if (!iosDeviceUDID) {
        logger.error("No iOS devices found to launch.");
        process.exit(1);
      }

      const spinner = logger.startSpinner(
        `Waiting for iOS device '${iosDeviceUDID}' to boot...`,
      );

      const launched = await launchSimulator("ios", iosDeviceUDID);

      if (launched) {
        const booted = await waitForDeviceBoot("ios", iosDeviceUDID);

        if (booted) {
          runConfigs.iosDeviceUDID = iosDeviceUDID;
          logger.stopSpinner(
            spinner,
            `iOS device '${iosDeviceUDID}' is now booted and ready.`,
          );
        } else {
          logger.stopSpinner(
            spinner,
            undefined,
            `Failed to boot iOS device '${iosDeviceUDID}' within the expected time.`,
          );
          process.exit(1);
        }
      } else {
        logger.stopSpinner(
          spinner,
          undefined,
          `Failed to launch iOS device '${iosDeviceUDID}'.`,
        );
        process.exit(1);
      }
    }
  }

  if (config.project.platforms.android) {
    const spinner = logger.startSpinner(
      "Checking for booted Android devices...",
    );

    const bootedAndroidDevices = await getBootedDevices("android");

    if (!options.androidDeviceUDID) {
      if (bootedAndroidDevices.length === 0) {
        logger.stopSpinner(
          spinner,
          undefined,
          "No booted Android devices found.",
        );
      } else {
        runConfigs.androidDeviceUDID = bootedAndroidDevices[0];
        logger.stopSpinner(
          spinner,
          `Using booted Android device: ${bootedAndroidDevices[0]}`,
        );
      }
    } else {
      if (bootedAndroidDevices.includes(options.androidDeviceUDID)) {
        runConfigs.androidDeviceUDID = options.androidDeviceUDID;
        logger.stopSpinner(
          spinner,
          `Using specified Android device: ${options.androidDeviceUDID}`,
        );
      } else {
        logger.stopSpinner(
          spinner,
          undefined,
          `Specified Android device '${options.androidDeviceUDID}' is not booted yet.`,
        );
      }
    }

    if (!runConfigs.androidDeviceUDID) {
      const devices = await getAllDevices("android");
      let androidDeviceUDID = "";

      if (
        options?.androidDeviceUDID &&
        !devices.includes(options.androidDeviceUDID)
      ) {
        logger.error(
          `Specified Android device '${options.androidDeviceUDID}' not found among available devices.`,
        );
        process.exit(1);
      }

      // at this point, this is just the avd name, not the running emulator id
      // E.G PIXEL_5_API_34
      // running emulator id example is: emulator-5554
      androidDeviceUDID = options?.androidDeviceUDID || devices[0];

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
            runConfigs.androidDeviceUDID = startedDeviceId;

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
  }

  logger.log(JSON.stringify(runConfigs, null, 2));
  logger.log(JSON.stringify(config, null, 2));

  // Check the devices we will be doing it for first, from the config.

  // Check if the devices are connected by running each emulator/simulator command and checking the output for connected devices.
  // If any of the devices are not connected, show an error message and exit.
  // If all devices are connected, run the app on each device using the appropriate command for each platform.
  // ==== AFTER RUNNING THE APP ====
}
