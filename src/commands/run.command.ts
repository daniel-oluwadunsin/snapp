import { snapp } from "../config/program";

snapp
  .command("run")
  .description("Run the app on a connected device or emulator")
  .action(runSnapp);

async function runSnapp() {
  // Check the devices we will be doing it for first, from the config.
  // Check if the devices are connected by running each emulator/simulator command and checking the output for connected devices.
  // If any of the devices are not connected, show an error message and exit.
  // If all devices are connected, run the app on each device using the appropriate command for each platform.
  // ==== AFTER RUNNING THE APP ====
}
