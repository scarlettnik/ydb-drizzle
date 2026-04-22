import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let envLoaded = false;

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();

  if (trimmed === "" || trimmed.startsWith("#")) {
    return undefined;
  }

  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, equalsIndex).trim();
  let value = trimmed.slice(equalsIndex + 1).trim();

  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export function loadTestEnv(): void {
  if (envLoaded) {
    return;
  }

  const root = resolve(process.cwd());
  for (const fileName of [".env.test", ".env"]) {
    const filePath = resolve(root, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      const [key, value] = parsed;
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  envLoaded = true;
}
