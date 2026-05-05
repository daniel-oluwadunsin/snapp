import { snapp } from "../config/program";
import { BundleId, SnappConfigFile } from "../types/snapp-config.types";
import fsp from "fs/promises";
import fs from "fs";
import path from "path";
import { logger } from "../utils/logger";
import { defaultConfig } from "../constants";
import inquirer from "inquirer";

snapp.command("init").action(initSnapp);

function doesConfigFileExist(): boolean {
  const filePath = path.join(process.cwd(), "snapp.config.json");
  return fs.existsSync(filePath);
}

async function createConfigFile(config: Partial<SnappConfigFile>) {
  const filePath = path.join(process.cwd(), "snapp.config.json");

  if (doesConfigFileExist()) {
    logger.error(
      "A snapp.config.json file already exists in this directory. Please remove it before initializing a new one.",
    );

    process.exit(1);
  }

  await fsp.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
}

async function getProjectName(): Promise<string> {
  return await inquirer
    .prompt({
      name: "projectName",
      type: "input",
      message: "What is the name of your app?",
      default: "My snapp project",
    })
    .then((answers) => answers.projectName)
    .catch((error) => {
      logger.error("An error occurred while getting user input:", error);
      process.exit(1);
    });
}

async function getPlatforms(): Promise<string[]> {
  return await inquirer
    .prompt({
      name: "platforms",
      type: "checkbox",
      message: "Which platforms do you want to test on?",
      choices: [
        { name: "iOS", value: "ios" },
        { name: "Android", value: "android" },
      ],
      default: ["ios", "android"],
    })
    .then((answers) => answers.platforms)
    .catch((error) => {
      logger.error("An error occurred while getting user input:", error);
      process.exit(1);
    });
}

async function getIOSBundleId(): Promise<string> {
  return await inquirer
    .prompt({
      name: "iosBundleId",
      type: "input",
      message: "What is the bundle ID of your iOS app?",
      default: "com.example.snapp",
    })
    .then((answers) => answers.iosBundleId?.trim()?.toLowerCase())
    .catch((error) => {
      logger.error("An error occurred while getting user input:", error);
      process.exit(1);
    });
}

async function getAndroidBundleId(defaultBundleId?: string): Promise<string> {
  return await inquirer
    .prompt({
      name: "androidBundleId",
      type: "input",
      message: defaultBundleId
        ? `What is the bundle ID of your Android app? (leave empty to use ${defaultBundleId})`
        : "What is the bundle ID of your Android app?",
    })
    .then(
      (answers) =>
        answers.androidBundleId?.trim()?.toLowerCase() || defaultBundleId,
    )
    .catch((error) => {
      logger.error("An error occurred while getting user input:", error);
      process.exit(1);
    });
}

async function initSnapp() {
  if (doesConfigFileExist()) {
    logger.error(
      "A snapp.config.json file already exists in this directory. Please remove it before initializing a new one.",
    );

    process.exit(1);
  }

  logger.logBrand();

  const config = defaultConfig;

  config.project.name = await getProjectName();

  const platforms = await getPlatforms();

  config.project.platforms = {
    ios: platforms.includes("ios"),
    android: platforms.includes("android"),
  };

  // Set the bundle IDs based on the platforms selected and the user input.
  // if only one platform is selected, set the bundleId to a string. If both platforms are selected, set the bundleId to an object with ios and android properties.
  // if both platforms have the same bundle ID, set the bundleId to a string. If both platforms have different bundle IDs, set the bundleId to an object with ios and android properties.
  if (config.project.platforms.ios) {
    const bundleId = await getIOSBundleId();
    if (!config.project.platforms?.android) {
      config.project.bundleId = bundleId as string;
    } else {
      config.project.bundleId = { ios: bundleId } as BundleId;
    }
  }

  if (config.project.platforms.android) {
    const bundleId = await getAndroidBundleId(
      typeof config.project.bundleId === "string"
        ? config.project.bundleId
        : typeof config?.project.bundleId === "object"
          ? (config.project.bundleId as BundleId).ios
          : undefined,
    );

    if (!config.project.platforms?.ios) {
      config.project.bundleId = bundleId as string;
    } else {
      if ((config.project.bundleId as BundleId)?.ios?.trim() === bundleId) {
        config.project.bundleId = bundleId as string;
      } else {
        config.project.bundleId = {
          ...(typeof config.project.bundleId === "object"
            ? config.project.bundleId
            : {}),
          android: bundleId,
        } as BundleId;
      }
    }
  }

  await createConfigFile(config);

  logger.success(
    `snapp.config.json file has been created successfully!\nCheck https://snapp.oluwadunsin.dev/docs/snapp-config for more details on how to customize your config file.`,
  );
}
