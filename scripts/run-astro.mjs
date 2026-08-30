import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const localRepoD2Dir = path.join(process.cwd(), ".d2", "bin");
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
const astroArgs = process.argv.slice(2);

function canRunD2(extraPathEntries) {
    const result = spawnSync("d2", ["--version"], {
        stdio: "ignore",
        shell: false,
        env: {
            ...process.env,
            PATH: extraPathEntries.join(pathSeparator)
        }
    });

    return result.status === 0;
}

function ensureD2ForBuild() {
    if (isWindows || astroArgs[0] !== "build") {
        return;
    }

    const repoD2Binary = path.join(localRepoD2Dir, "d2");

    if (canRunD2([localRepoD2Dir, ...pathEntries])) {
        pathEntries.unshift(localRepoD2Dir);
        return;
    }

    if (!fs.existsSync(repoD2Binary)) {
        execFileSync(
            "sh",
            [
                "-c",
                "curl -fsSL https://d2lang.com/install.sh | sh -s -- --prefix \"$PWD/.d2\""
            ],
            {
                stdio: "inherit",
                env: {
                    ...process.env
                }
            }
        );
    }

    pathEntries.unshift(localRepoD2Dir);
}

if (isWindows) {
    pathEntries.unshift(localD2Dir);
}

ensureD2ForBuild();

const child = isWindows
    ? spawn("cmd.exe", ["/c", astroBin, ...astroArgs], {
          stdio: "inherit",
          shell: false,
          env: {
              ...process.env,
              PATH: pathEntries.join(pathSeparator)
          }
      })
    : spawn(astroBin, astroArgs, {
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
