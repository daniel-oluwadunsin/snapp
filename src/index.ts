#!/usr/bin/env node

import { snapp } from "./config/program";

snapp.parse(process.argv);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
