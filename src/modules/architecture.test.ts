/**
 * Architecture rules from step 1, checked automatically:
 * 1. The rules layer is pure: no framework, no database, no screens.
 * 2. Modules depend only on the modules they are allowed to (no cycles).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES_DIR = join(process.cwd(), "src/modules");

const allowedDeps: Record<string, string[]> = {
  auth: [],
  barbershops: ["auth"],
  services: ["auth"],
  inventory: ["auth"],
  finance: ["auth"],
  employees: ["auth"],
  clients: ["auth", "barbershops"],
  "service-orders": ["auth", "services", "inventory", "finance", "clients", "employees"],
};

const forbiddenInRules = [/^next/, /^react/, /^@\/app/, /^@\/components/, /^@\/prototype/, /\/data\//, /\/api\//, /prisma/];

function ruleFiles(module: string): string[] {
  const dir = join(MODULES_DIR, module, "rules");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

function imports(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
}

describe("architecture", () => {
  it("every module folder is listed in the dependency map", () => {
    const folders = readdirSync(MODULES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(folders.sort()).toEqual(Object.keys(allowedDeps).sort());
  });

  for (const [module, allowed] of Object.entries(allowedDeps)) {
    it(`${module}/rules only imports allowed modules and no framework`, () => {
      for (const file of ruleFiles(module)) {
        for (const spec of imports(file)) {
          expect(forbiddenInRules.some((re) => re.test(spec)), `${file} imports ${spec}`).toBe(false);
          const target = spec.match(/^@\/modules\/([^/]+)\//)?.[1];
          if (target && target !== module) {
            expect(allowed, `${module} must not import ${target} (${file})`).toContain(target);
          }
        }
      }
    });
  }
});
