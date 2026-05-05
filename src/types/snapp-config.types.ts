type Project = {
  name: string;
  bundleId: {
    android: string;
    ios: string;
  };
};

type RunTime = {
  timeoutMs: number;
  delayAfterLaunchMs: number;
};

type DeepLink = {
  scheme: string;
  prefix: string;
  android: {
    host: string;
    pathPrefix: string;
  };
  ios: {
    host: string;
    pathPrefix: string;
  };
};

type DelayElement = "text" | "timeout";

type Screen = {
  name: string;
  url: string;
  waitFor: {
    type: DelayElement;
    value: string | number;
  };
  screenshot: {
    fileName: string;
  };
};

type Output = {
  dir: string;
  format: string;
  structure: {
    ios: boolean;
    android: boolean;
    groupByDevice: boolean;
    groupByScreen: boolean;
  };
};

export type SnappConfigFile = {
  project: Project;
  runtime: RunTime;
  deepLinks: DeepLink;
  screens: Screen[];
  output: Output;
};
