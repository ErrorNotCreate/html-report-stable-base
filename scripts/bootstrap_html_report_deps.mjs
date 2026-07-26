import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrapSteps = [
  "npm install",
  "pip install",
  "playwright install chromium",
];

function run(command, args, options = {}) {
  const shown = [command, ...args].join(" ");
  console.log(`[html-report deps] ${shown}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${shown} failed with exit code ${result.status}`);
  }
}

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function pythonVersion(command) {
  const result = spawnSync(command, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return null;
  const [major, minor] = result.stdout.trim().split(".").map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

function supportsPythonDeps(command) {
  const version = pythonVersion(command);
  return Boolean(version && (version.major > 3 || (version.major === 3 && version.minor >= 10)));
}

function venvPythonPath() {
  return process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
}

if (!fs.existsSync(path.join(root, "package.json"))) {
  throw new Error(`package.json not found at ${root}`);
}

console.log(`[html-report deps] steps: ${bootstrapSteps.join(" -> ")}`);

if (!commandExists("npm", ["--version"])) {
  throw new Error("npm is required to install html-report Node dependencies");
}

const pythonCandidates = [
  process.env.PYTHON,
  "python",
  "python3.12",
  "python3.11",
  "python3.10",
  "python3",
].filter(Boolean);
const python = pythonCandidates.find((candidate) => commandExists(candidate, ["--version"]) && supportsPythonDeps(candidate));
if (!python) {
  throw new Error("Python >=3.10 is required to install html-report Python dependencies");
}

run("npm", ["install"]);
if (!fs.existsSync(venvPythonPath())) {
  run(python, ["-m", "venv", ".venv"]);
}
run(venvPythonPath(), ["-m", "pip", "install", "--upgrade", "pip"]);
run(venvPythonPath(), ["-m", "pip", "install", "-r", "requirements.txt"]);
run("npx", ["playwright", "install", "chromium"]);
run(venvPythonPath(), ["-m", "playwright", "install", "chromium"]);

console.log("[html-report deps] ready");
console.log(`[html-report deps] Python tools: ${venvPythonPath()}`);
