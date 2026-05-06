export type Device = {
  name?: string;
  id?: string;
};

export type RunConfig = {
  androidDeviceUDID?: string;
  iosDeviceUDID?: string;
};

export type RunSnappOptions = {
  iosDeviceUDID?: string;
  androidDeviceUDID?: string;
};

export type RunStatus = "pending" | "completed" | "failed";
