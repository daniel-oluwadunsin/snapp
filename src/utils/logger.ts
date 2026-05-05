import chalk from "chalk";

export class SnappLogger {
  info(message: string) {
    console.log(chalk.blue("[INFO]"), message);
  }

  error(message: string) {
    console.log(chalk.red("[ERROR]"), message);
  }

  warn(message: string) {
    console.log(chalk.yellow("[WARN]"), message);
  }

  success(message: string) {
    console.log(chalk.green("[SUCCESS]"), message);
  }
}

export const logger = new SnappLogger();
