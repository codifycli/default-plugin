import { ParameterSetting, Plan, SpawnStatus, StatefulParameter, getPty, z } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import path from 'node:path';

export const goPackageSchema = z.union([
  z.string().describe('Package path, optionally with a version: "golang.org/x/tools/gopls", "golang.org/x/tools/gopls@v0.20.0". Without a version (or with @latest) the newest version is installed and any installed version counts as installed.'),
  z.object({
    package: z.string().describe('Package path, optionally with a version, e.g. "github.com/golang-migrate/migrate/v4/cmd/migrate@latest".'),
    tags: z.array(z.string()).optional().describe('Build tags passed to go install -tags, e.g. ["postgres", "sqlite3"].'),
  }).describe('A package with build options.'),
]);

export type GoPackage = z.infer<typeof goPackageSchema>;

/** A Go binary found in the Go bin directory */
export interface InstalledGoBinary {
  file: string;
  path: string;
  version?: string;
}

type GoPackagesConfig = { packages?: GoPackage[] } & Record<string, unknown>;

function packageString(pkg: GoPackage): string {
  return typeof pkg === 'string' ? pkg : pkg.package;
}

/** The package path without its version */
export function goPackagePath(pkg: GoPackage): string {
  const value = packageString(pkg);
  const atIndex = value.lastIndexOf('@');
  return atIndex > 0 ? value.slice(0, atIndex) : value;
}

/** The requested version, or undefined for "any version" (no version or @latest) */
export function goPackageVersion(pkg: GoPackage): string | undefined {
  const value = packageString(pkg);
  const atIndex = value.lastIndexOf('@');
  const version = atIndex > 0 ? value.slice(atIndex + 1) : undefined;
  return version === 'latest' ? undefined : version;
}

/** Whether an installed package (`path@version` from refresh) satisfies a desired package */
export function isGoPackageEqual(desired: GoPackage, current: GoPackage): boolean {
  if (goPackagePath(desired) !== goPackagePath(current)) {
    return false;
  }

  const version = goPackageVersion(desired);
  return version === undefined || version === goPackageVersion(current);
}

/** Parses the output of `go version -m <bin dir>` */
export function parseGoVersionM(output: string): InstalledGoBinary[] {
  const binaries: InstalledGoBinary[] = [];

  for (const line of output.split(/\r?\n/)) {
    // Each binary starts with "<file>: go1.x.y", followed by tab indented metadata lines
    const header = line.match(/^(\S.*): go\S+\s*$/);
    if (header) {
      binaries.push({ file: header[1], path: '' });
      continue;
    }

    const current = binaries.at(-1);
    const [, key, value, version] = line.split('\t');
    if (!current || !line.startsWith('\t')) continue;

    if (key === 'path') current.path = value;
    if (key === 'mod' && version) current.version = version;
  }

  // Binaries without module information (built outside a module) can't be matched to a package
  return binaries.filter((b) => b.path);
}

/**
 * Programs installed with `go install`, e.g. gopls, golangci-lint or delve. They're read back from the Go bin
 * directory (GOBIN, or GOPATH/bin) with `go version -m`. In the default (declarative) mode only the listed packages are
 * managed: other programs in the bin directory are left alone.
 */
export class GoPackagesParameter extends StatefulParameter<GoPackagesConfig, GoPackage[]> {
  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: isGoPackageEqual,
      filterInStatelessMode: (desired: GoPackage[], current: GoPackage[]) =>
        current.filter((c) => desired.some((d) => goPackagePath(d) === goPackagePath(c))),
    };
  }

  async refresh(): Promise<GoPackage[] | null> {
    const binaries = await listInstalledBinaries();
    if (!binaries) return null;

    return binaries.map((b) => (b.version ? `${b.path}@${b.version}` : b.path));
  }

  async add(valuesToAdd: GoPackage[]): Promise<void> {
    await this.install(valuesToAdd);
  }

  async modify(newValue: GoPackage[], previousValue: GoPackage[], plan: Plan<GoPackagesConfig>): Promise<void> {
    const toInstall = newValue.filter((n) => !previousValue.some((p) => isGoPackageEqual(n, p)));
    const toUninstall = previousValue.filter((p) => !newValue.some((n) => goPackagePath(n) === goPackagePath(p)));

    if (plan.isStateful) {
      await this.uninstall(toUninstall);
    }

    // go install replaces the binary when a different version is requested
    await this.install(toInstall);
  }

  async remove(valuesToRemove: GoPackage[]): Promise<void> {
    await this.uninstall(valuesToRemove);
  }

  private async install(packages: GoPackage[]): Promise<void> {
    const $ = getPty();

    for (const pkg of packages) {
      const tags = typeof pkg === 'object' && pkg.tags && pkg.tags.length > 0 ? ` -tags '${pkg.tags.join(',')}'` : '';
      const version = goPackageVersion(pkg) ?? 'latest';
      await $.spawn(`go install${tags} ${goPackagePath(pkg)}@${version}`, { interactive: true });
    }
  }

  private async uninstall(packages: GoPackage[]): Promise<void> {
    if (packages.length === 0) return;

    const binaries = await listInstalledBinaries() ?? [];
    for (const pkg of packages) {
      for (const binary of binaries.filter((b) => b.path === goPackagePath(pkg))) {
        await fs.rm(binary.file, { force: true });
      }
    }
  }
}

/** The binaries in the Go bin directory, or null when Go isn't available */
async function listInstalledBinaries(): Promise<InstalledGoBinary[] | null> {
  const $ = getPty();

  const { data: gobin, status } = await $.spawnSafe('go env GOBIN', { interactive: true });
  if (status === SpawnStatus.ERROR) return null;

  let binDir = gobin.trim();
  if (!binDir) {
    const { data: gopath, status: gopathStatus } = await $.spawnSafe('go env GOPATH', { interactive: true });
    if (gopathStatus === SpawnStatus.ERROR || !gopath.trim()) return null;

    binDir = path.join(gopath.trim().split(path.delimiter)[0], 'bin');
  }

  try {
    await fs.access(binDir);
  } catch {
    return [];
  }

  const { data, status: versionStatus } = await $.spawnSafe(`go version -m "${binDir}"`, { interactive: true });
  if (versionStatus === SpawnStatus.ERROR) return [];

  return parseGoVersionM(data);
}
