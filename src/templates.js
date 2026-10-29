import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readTemplate(relativePath) {
  return readFile(path.join(packageRoot, "templates", relativePath), "utf8");
}

export function renderTemplate(source, values) {
  return source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`模板缺少变量 ${key}`);
    return String(values[key]);
  });
}
