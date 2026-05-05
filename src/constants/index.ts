import { SnappConfigFile } from "../types/snapp-config.types";

export const IAMGE_FORMATS = ["png", "jpg", "jpeg"] as const;

export const DEFAULT_SCREENSHOT_OUTPUT_DIR = "./screenshots";
export const DEFAULT_SCREENSHOT_FORMAT = "png";
export const DEFAULT_SCREENSHOT_STRUCTURE = {
  groupByDevice: true,
  groupByScreen: false,
};

export const DEFAULT_RUNTIME_CONFIG = {
  timeoutMs: 5000,
  delayAfterLaunchMs: 2000,
};

export const defaultConfig: SnappConfigFile = {
  project: {
    name: "My snapp project",
    bundleId: {
      android: "com.example.snapp",
      ios: "com.example.snapp",
    },
    platforms: {
      ios: true,
      android: true,
    },
  },

  runtime: DEFAULT_RUNTIME_CONFIG,
  deepLinks: {
    scheme: "myapp",
    prefix: "myapp://",
    android: {
      host: "example.com",
      pathPrefix: "/",
    },
    ios: {
      host: "example.com",
      pathPrefix: "/",
    },
  },
  screens: [
    {
      name: "Home Screen",
      url: "home",
      waitFor: {
        type: "timeout",
        value: 3000,
      },
      screenshot: {
        fileName: "home.png",
      },
    },
    {
      name: "Profile Screen",
      url: "/profile/1234",
      waitFor: {
        type: "text",
        value: "Profile",
      },
      screenshot: {
        fileName: "profile.png",
      },
    },
  ],

  output: {
    dir: DEFAULT_SCREENSHOT_OUTPUT_DIR,
    format: DEFAULT_SCREENSHOT_FORMAT,
    structure: DEFAULT_SCREENSHOT_STRUCTURE,
  },
};
