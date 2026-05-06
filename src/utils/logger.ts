import boxen from "boxen";
import chalk from "chalk";
import figlet from "figlet";
import ora, { Ora } from "ora";

export class SnappLogger {
  info(...messages: any[]) {
    console.log(chalk.blue("[INFO]"), ...messages);
  }

  error(...messages: any[]) {
    console.log(chalk.red("[ERROR]"), ...messages);
  }

  warn(...messages: any[]) {
    console.log(chalk.yellow("[WARN]"), ...messages);
  }

  success(...messages: any[]) {
    console.log(chalk.green("[SUCCESS]"), ...messages);
  }

  log(...messages: any[]) {
    console.log(...messages);
  }

  logBrand() {
    const brand = boxen(
      figlet.textSync("Snapp </>", {
        horizontalLayout: "full",
      }),
      {
        padding: 1,
        borderColor: "green",
        borderStyle: "doubleSingle",
      },
    );

    console.log(chalk.green(brand));
  }

  startSpinner(message: string): Ora {
    const spinner = ora(message).start();
    return spinner;
  }

  stopSpinner(
    spinner: Ora,
    successMessage?: string,
    warningMessage?: string,
    errorMessage?: string,
  ) {
    if (successMessage) {
      spinner.succeed(successMessage);
    }
    if (warningMessage) {
      spinner.warn(warningMessage);
    }
    if (errorMessage) {
      spinner.fail(errorMessage);
    }
  }
}

export const logger = new SnappLogger();
