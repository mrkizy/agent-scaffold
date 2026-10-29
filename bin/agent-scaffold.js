#!/usr/bin/env node
import { main } from "../src/cli.js";

main(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`agent-scaffold: ${message}\n`);
  process.exitCode = 1;
});
