import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const astroBin = path.join(
    process.cwd(),
    "node_modules",
    ".bin",
    isWindows ? "astro.cmd" : "astro"
);
const localD2Dir = path.join(process.cwd(), ".local-tools", "d2-v0.7.1", "bin");
const existingPath = process.env.PATH ?? "";
const pathSeparator = path.delimiter;
const pathEntries = [process.cwd(), existingPath];

if (isWindows) {
    pathEntries.unshift(localD2Dir);
}

const child = isWindows
    ? spawn("cmd.exe", ["/c", astroBin, ...process.argv.slice(2)], {
          stdio: "inherit",
          shell: false,
          env: {
              ...process.env,
              PATH: pathEntries.join(pathSeparator)
          }
      })
    : spawn(astroBin, process.argv.slice(2), {
          stdio: "inherit",
          shell: false,
          env: {
              ...process.env,
              PATH: pathEntries.join(pathSeparator)
          }
      });

child.on("exit", (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 0);
});
