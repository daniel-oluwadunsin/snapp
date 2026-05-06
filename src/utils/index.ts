import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { DEFAULT_CONFIG_FILE_NAME, IAMGE_FORMATS } from "../constants";
import { BundleId, SnappConfigFile } from "../types/snapp-config.types";
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

  if (!config?.deepLinks?.scheme || !config?.deepLinks?.prefix) {
    throw new Error("Missing 'scheme' or 'prefix' in 'deepLinks' section");
  }

  if (config?.project?.platforms?.android) {
    if (
      !config?.deepLinks?.android ||
      !config?.deepLinks?.android?.host ||
      !config?.deepLinks?.android?.pathPrefix
    ) {
      throw new Error(
        "Missing 'android' deep link configuration in 'deepLinks' section",
      );
    }
  }

  if (config?.project?.platforms?.ios) {
    if (
      !config?.deepLinks?.ios ||
      !config?.deepLinks?.ios?.host ||
      !config?.deepLinks?.ios?.pathPrefix
    ) {
      throw new Error(
        "Missing 'ios' deep link configuration in 'deepLinks' section",
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
  lines = lines.splice(1);
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
