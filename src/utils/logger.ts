import boxen from "boxen";
import chalk from "chalk";
import figlet from "figlet";

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
}

export const logger = new SnappLogger();
