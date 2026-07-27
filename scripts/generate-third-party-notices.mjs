import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cargoHome = process.env.CARGO_HOME || join(process.env.USERPROFILE || process.env.HOME || "", ".cargo");
const packages = [];

function readText(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
}

function normalizeWebsite(value) {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}

function packagePageUrl(ecosystem, name, version) {
  return ecosystem === "npm"
    ? `https://www.npmjs.com/package/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}`
    : `https://crates.io/crates/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
}

function licenseUrl(ecosystem, name, version, license) {
  if (license && /^[A-Za-z0-9.-]+\+?$/.test(license)) {
    return `https://spdx.org/licenses/${encodeURIComponent(license.replace(/\+$/, ""))}.html`;
  }

  return packagePageUrl(ecosystem, name, version);
}

function addPackage({ ecosystem, name, version, license, website }) {
  const declaredLicense = license || "未声明";
  packages.push({
    ecosystem,
    name,
    version,
    license: declaredLicense,
    licenseUrl: licenseUrl(ecosystem, name, version, license),
    website: normalizeWebsite(website),
  });
}

function resolvePackageDirectory(name, fromDirectory) {
  let current = fromDirectory;
  while (true) {
    const candidate = join(current, "node_modules", name);
    if (existsSync(candidate)) {
      return realpathSync(candidate);
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function collectNpmPackages() {
  const visited = new Set();
  const rootManifest = JSON.parse(readText(join(root, "package.json")));

  function visit(name, fromDirectory) {
    const packageDir = resolvePackageDirectory(name, fromDirectory);
    if (!packageDir) {
      throw new Error(`Unable to resolve npm package: ${name}`);
    }

    const manifest = JSON.parse(readText(join(packageDir, "package.json")));
    const id = `npm:${manifest.name}@${manifest.version}:${packageDir}`;
    if (visited.has(id)) {
      return;
    }
    visited.add(id);

    addPackage({
      ecosystem: "npm",
      name: manifest.name,
      version: manifest.version,
      license: typeof manifest.license === "string" ? manifest.license : undefined,
      website: manifest.homepage || (typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url),
    });

    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      visit(dependency, packageDir);
    }
  }

  for (const dependency of Object.keys(rootManifest.dependencies || {})) {
    visit(dependency, root);
  }
}

function readTomlString(contents, key) {
  const match = contents.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match?.[1];
}

function findCargoPackageDirectory(name, version) {
  const sourceRoot = join(cargoHome, "registry", "src");
  if (!existsSync(sourceRoot)) {
    return undefined;
  }

  for (const registry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const candidate = join(sourceRoot, registry.name, `${name}-${version}`);
    if (registry.isDirectory() && existsSync(candidate)) {
      return candidate;
    }
  }
}

function collectCargoPackages() {
  const lockFile = readText(join(root, "src-tauri", "Cargo.lock"));
  const entries = lockFile.split(/^\[\[package\]\]$/m).slice(1);

  for (const entry of entries) {
    const name = readTomlString(entry, "name");
    const version = readTomlString(entry, "version");
    const source = readTomlString(entry, "source");
    if (!name || !version || !source?.startsWith("registry+")) {
      continue;
    }

    const packageDir = findCargoPackageDirectory(name, version);
    if (!packageDir) {
      throw new Error(`Unable to find Cargo source: ${name}@${version}. Run cargo fetch first.`);
    }

    const manifest = readText(join(packageDir, "Cargo.toml"));
    addPackage({
      ecosystem: "Cargo",
      name,
      version,
      license: readTomlString(manifest, "license"),
      website: readTomlString(manifest, "homepage") || readTomlString(manifest, "repository"),
    });
  }
}

collectNpmPackages();
collectCargoPackages();

packages.sort((left, right) =>
  left.ecosystem.localeCompare(right.ecosystem) || left.name.localeCompare(right.name) || left.version.localeCompare(right.version),
);

const output = {
  packages,
};
const outputPath = join(root, "src", "generated", "third-party-notices.json");
writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Generated ${packages.length} third-party package links.`);
