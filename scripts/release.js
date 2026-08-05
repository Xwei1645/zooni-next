import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const [releaseType] = process.argv.slice(2)
const releaseTypes = new Set(["patch", "minor", "major"])

if (!releaseTypes.has(releaseType)) {
  console.error("Usage: pnpm release <patch|minor|major>")
  process.exit(1)
}

const rootDir = resolve(import.meta.dirname, "..")
const packageJsonPath = resolve(rootDir, "package.json")
const cargoTomlPath = resolve(rootDir, "src-tauri", "Cargo.toml")
const tauriConfPath = resolve(rootDir, "src-tauri", "tauri.conf.json")

function run(command, args) {
  const useShell = process.platform === "win32" && command === "pnpm"

  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: useShell,
    stdio: ["inherit", "pipe", "inherit"],
  }).trim()
}

function requireCleanWorktree() {
  if (run("git", ["status", "--porcelain"])) {
    throw new Error("Working tree must be clean before creating a release.")
  }
}

function nextVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)

  if (!match) {
    throw new Error(`package.json has an unsupported version: ${version}`)
  }

  const [, major, minor, patch] = match.map(Number)

  if (releaseType === "major") return `${major + 1}.0.0`
  if (releaseType === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

try {
  requireCleanWorktree()

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const version = nextVersion(packageJson.version)
  const tag = `v${version}`
  const existingTag = run("git", ["tag", "--list", tag])

  if (existingTag) {
    throw new Error(`Tag ${tag} already exists.`)
  }

  console.log(`Bumping version: ${packageJson.version} -> ${version}`)
  run("pnpm", ["build"])

  packageJson.version = version
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)

  const cargoToml = readFileSync(cargoTomlPath, "utf8").replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`,
  )
  writeFileSync(cargoTomlPath, cargoToml)

  run("cargo", ["metadata", "--format-version", "1", "--manifest-path", "src-tauri/Cargo.toml"])

  const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"))
  tauriConf.version = version
  writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`)

  run("git", ["add", "package.json", "src-tauri/Cargo.toml", "src-tauri/tauri.conf.json", "src-tauri/Cargo.lock"])
  run("git", ["commit", "-m", `chore: bump version to ${version}`])
  run("git", ["tag", "-a", tag, "-m", `${tag}`])
  run("git", ["push", "origin", "HEAD"])
  run("git", ["push", "origin", tag])

  console.log(`Released ${tag}. The GitHub Actions workflow will create a draft release.`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
