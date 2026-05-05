import { IAMGE_FORMATS } from "../constants";
import { BundleId, SnappConfigFile } from "../types/snapp-config.types";

const getConfigFile = () => {};

const validateConfigFile = (config: SnappConfigFile) => {
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
    config?.project?.bundleId !== "string" &&
    !(config?.project?.bundleId as BundleId)?.ios
  ) {
    throw new Error("Missing 'ios' bundleId in 'project.bundleId'");
  }

  if (
    config?.project?.platforms?.android &&
    config?.project?.bundleId !== "string" &&
    !(config?.project?.bundleId as BundleId)?.android
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
