export type Platform = "ios" | "android";

export type BundleId = {
  ios: string;
  android: string;
};

type Project = {
  name?: string;
  platforms?: {
    ios: boolean;
    android: boolean;
  };
  bundleId?: string | BundleId;
};

type RunTime = {
  timeoutMs?: number;
  delayAfterLaunchMs?: number;
};

type DeepLink = {
  scheme?: string;
  prefix?: string;
  android?: {
    host?: string;
    pathPrefix?: string;
  };
  ios?: {
    host?: string;
    pathPrefix?: string;
  };
};

type DelayElement = "text" | "timeout";

type Screen = {
  name?: string;
  url?: string;
  waitFor?: {
    type?: DelayElement;
    value?: string | number;
  };
  screenshot?: {
    fileName?: string;
  };
};

type Output = {
  dir?: string;
  format?: string;
  structure?: {
    groupByDevice?: boolean;
    groupByScreen?: boolean;
  };
};

type Command = {
  run: Record<Platform, string>;
};

export type SnappConfigFile = {
  project: Project;
  runtime: RunTime;
  deepLinks: DeepLink;
  screens: Screen[];
  output: Output;
  commands?: Command;
};
