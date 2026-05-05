#!/usr/bin/env node

import { snapp } from "./config/program";
import { logger } from "./utils/logger";

import "./commands";

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  logger.warn("Gracefully shutting down 👋");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.warn("Gracefully shutting down 👋");
  process.exit(0);
});

snapp.parse(process.argv);
