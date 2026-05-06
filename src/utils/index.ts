import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import {
  DEFAULT_CONFIG_FILE_NAME,
  DEFAULT_SCREENSHOT_OUTPUT_DIR,
  IAMGE_FORMATS,
} from "../constants";
import {
  BundleId,
  PathPrefix,
  Platform,
  SnappConfigFile,
} from "../types/snapp-config.types";
import { logger } from "./logger";
import { Device } from "../types/run-snapp.types";

export function doesConfigFileExist(): boolean {
  const filePath = path.join(process.cwd(), "snapp.config.json");
  return fs.existsSync(filePath);
}

export const validateConfigFile = (config: SnappConfigFile) => {
  if (!config.project) {
    throw new Error("Missing 'project' section in config file");
  }

  if (
    !config?.project?.platforms?.ios &&
    !config?.project?.platforms?.android
  ) {
    throw new Error(
      "At least one platform (ios or android) must be enabled in 'project.platforms'",
    );
  }

  if (
    config?.project?.platforms?.ios &&
    typeof config?.project?.bundleId !== "string" &&
    !config?.project?.bundleId?.ios
  ) {
    throw new Error("Missing 'ios' bundleId in 'project.bundleId'");
  }

  if (
    config?.project?.platforms?.android &&
    typeof config?.project?.bundleId !== "string" &&
    !config?.project?.bundleId?.android
  ) {
    throw new Error("Missing 'android' bundleId in 'project.bundleId'");
  }

  if (
    !config?.project?.bundleId ||
    (typeof config?.project?.bundleId !== "string" &&
      (!config?.project?.bundleId?.android || !config?.project?.bundleId?.ios))
  ) {
    throw new Error("Missing or invalid 'bundleId' in 'project' section");
  }

  if (!config?.deepLinks) {
    throw new Error("Missing 'deepLinks' section in config file");
  }

  const deeplinkRegex = /^(https?:\/\/.+|[a-zA-Z][a-zA-Z\d+.-]*:\/\/.*)$/;

  if (config?.project?.platforms?.ios) {
    const deeplinkPrefix = getDeepLinkPrefix(config.deepLinks.prefix, "ios");
    if (!deeplinkPrefix) {
      throw new Error(
        "Missing 'ios' deep link configuration in 'deepLinks' section",
      );
    }

    if (!deeplinkRegex.test(deeplinkPrefix)) {
      throw new Error(
        `Invalid iOS deep link prefix '${deeplinkPrefix}'. It must start with a valid scheme (e.g., 'myapp://', 'http://', 'https://')`,
      );
    }
  }

  if (config?.project?.platforms?.android) {
    const deeplinkPrefix = getDeepLinkPrefix(
      config.deepLinks.prefix,
      "android",
    );
    if (!deeplinkPrefix) {
      throw new Error(
        "Missing 'android' deep link configuration in 'deepLinks' section",
      );
    }

    if (!deeplinkRegex.test(deeplinkPrefix)) {
      throw new Error(
        `Invalid Android deep link prefix '${deeplinkPrefix}'. It must start with a valid scheme (e.g., 'myapp://', 'http://', 'https://')`,
      );
    }
  }

  if (
    config?.output?.format &&
    !IAMGE_FORMATS.includes(config.output.format as any)
  ) {
    throw new Error(
      `Invalid output format '${config.output.format}'. Supported formats are: ${IAMGE_FORMATS.join(", ")}`,
    );
  }
};

export const readAndValidateConfigFile = async (): Promise<SnappConfigFile> => {
  if (!doesConfigFileExist()) {
    throw new Error(
      `Config file '${DEFAULT_CONFIG_FILE_NAME}' not found in the current directory.`,
    );
  }

  const filePath = path.join(process.cwd(), DEFAULT_CONFIG_FILE_NAME);

  try {
    const fileContent = await fsp.readFile(filePath, "utf-8");
    const config: SnappConfigFile = JSON.parse(fileContent);

    validateConfigFile(config);
    return config;
  } catch (error) {
    logger.error("Error reading or validating config file:", error);
    process.exit(1);
  }
};

export const parseIosDevices = (output: string): Device[] => {
  const lines = output.split("\n");
  const devices = [];

  lines.forEach((line) => {
    const match = line.match(/(.*)\s\(([^)]+)\)\s\((Booted|Shutdown|.*)\)/);
    if (match) {
      const name = match[1].trim();
      const udid = match[2];
      const state = match[3];
      devices.push({
        name,
        id: udid,
      });
    }
  });

  return devices;
};

export const parseIOSDeviceIdentifiers = (
  output: string,
): { active: string[]; inactive: string[] } => {
  const lines = output.split("\n");
  const activeDevices: string[] = [];
  const inactiveDevices: string[] = [];

  lines.forEach((line) => {
    const match = line.match(/.*\(([^)]+)\)\s\((Booted|Shutdown|.*)\)/);
    if (match) {
      const udid = match[1];
      const state = match[2];

      if (state?.trim()?.toLowerCase() === "booted") {
        activeDevices.push(udid);
      } else {
        inactiveDevices.push(udid);
      }
    }
  });

  return { active: activeDevices, inactive: inactiveDevices };
};

export const parseAndroidDeviceIdentifiers = (
  output: string,
): { active: string[]; inactive: string[] } => {
  let lines = output.split("\n");
  // remove the first "List of devices attached" line
  lines = lines.filter(
    (line) => !line.toLowerCase().includes("list of devices attached"),
  );
  const activeDevices: string[] = [];
  const inactiveDevices: string[] = [];

  lines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const serial = parts[0];
      const state = parts[1];

      if (state === "device") {
        activeDevices.push(serial);
      } else {
        inactiveDevices.push(serial);
      }
    }
  });

  return { active: activeDevices, inactive: inactiveDevices };
};

export const parseAndroidEmulatorAvds = (output: string): string[] => {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
};

export const hasEmulator = (output: string, needsToBeBooted: boolean = false) =>
  output
    .split("\n")
    .some(
      (line) =>
        line.startsWith("emulator-") &&
        (!needsToBeBooted || (needsToBeBooted && line.includes("device"))),
    );

export const hasIOSDeviceBooted = (output: string, deviceId: string) => {
  output = output.trim().toLowerCase();
  return (
    output.includes(`${deviceId}`) &&
    (output.includes("booted") || output.includes("finished"))
  );
};

export const getBundleId = (
  bundleId: string | BundleId,
  platform: Platform,
): string => {
  return typeof bundleId === "string"
    ? bundleId
    : platform === "ios"
      ? bundleId.ios
      : bundleId.android;
};

export function getDeepLinkPrefix(
  deeplink: string | PathPrefix,
  platform: Platform,
): string {
  return typeof deeplink === "string"
    ? deeplink
    : platform === "ios"
      ? deeplink.ios
      : deeplink.android;
}

export const resolveDeepLinkUrl = (prefix: string, url: string): string => {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith(prefix)
  ) {
    return url;
  }

  // like myapp://home or myapp://profile/1234 but prefix starts with myapp://, so url must start with home or profile/1234 not with myapp://home or myapp://profile/1234 or /home or /profile/1234

  if (url.startsWith("/")) {
    url = url.substring(1);
  } else if (url.startsWith(prefix)) {
    url = url.substring(prefix.length);
  }

  return prefix + url;
};

export const resolveScreenshotFilePath = (
  platform: Platform,
  fileName: string,
  screenName: string,
  config: SnappConfigFile,
): string => {
  const basePath = process.cwd();
  const outputDir = config.output.dir || DEFAULT_SCREENSHOT_OUTPUT_DIR;

  let fileBasePath;

  if (config.output.structure?.groupByDevice) {
    fileBasePath = path.join(basePath, outputDir, platform);
  } else if (config.output.structure?.groupByScreen) {
    fileName = `${platform}-${fileName}`;
    fileBasePath = path.join(basePath, outputDir, screenName);
  }

  fs.mkdirSync(fileBasePath, { recursive: true });

  return path.join(fileBasePath, fileName);
};
