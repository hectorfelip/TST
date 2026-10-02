/**
 * Architecture rules, checked automatically:
 * 1. The RULES layer is pure: no framework, no database, no screens.
 * 2. The DATA layer talks to the database ONLY through `Tx` (src/db/client.ts):
 *    modules never import the `pg` driver (except for types) and never use the
 *    admin connection. That is what keeps the isolation between barbershops
 *    in one single place.
 * 3. Modules depend only on the modules they are allowed to (no cycles).
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
  employees: ["auth", "barbershops"],
  clients: ["auth", "barbershops"],
  "service-orders": ["auth", "barbershops", "services", "inventory", "finance", "clients", "employees"],
};

const forbiddenEverywhere = [/^next/, /^react/, /^@\/app/, /^@\/components/, /^@\/prototype/];
const forbiddenInRules = [...forbiddenEverywhere, /\/data\//, /\/api\//, /prisma/, /^pg$/, /^@\/db/];
const forbiddenInData = [...forbiddenEverywhere, /\/api\//, /^@\/db\/admin$/, /^@\/db\/migrate$/];

function sourceFiles(module: string, layer: "rules" | "data"): string[] {
  const dir = join(MODULES_DIR, module, layer);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

type Import = { spec: string; typeOnly: boolean };

function imports(file: string): Import[] {
  return [...readFileSync(file, "utf8").matchAll(/import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/g)].map((m) => ({ spec: m[2], typeOnly: Boolean(m[1]) }));
}

describe("architecture", () => {
  it("every module folder is listed in the dependency map", () => {
    const folders = readdirSync(MODULES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(folders.sort()).toEqual(Object.keys(allowedDeps).sort());
  });

  for (const [module, allowed] of Object.entries(allowedDeps)) {
    it(`${module}/rules is pure and only imports allowed modules`, () => {
      for (const file of sourceFiles(module, "rules")) {
        for (const { spec } of imports(file)) {
          expect(forbiddenInRules.some((re) => re.test(spec)), `${file} imports ${spec}`).toBe(false);
          const target = spec.match(/^@\/modules\/([^/]+)\//)?.[1];
          if (target && target !== module) expect(allowed, `${module} must not import ${target} (${file})`).toContain(target);
        }
      }
    });

    it(`${module}/data reaches the database only through Tx, never through the driver or the admin connection`, () => {
      for (const file of sourceFiles(module, "data")) {
        for (const { spec, typeOnly } of imports(file)) {
          expect(forbiddenInData.some((re) => re.test(spec)), `${file} imports ${spec}`).toBe(false);
          if (spec === "pg") expect(typeOnly, `${file}: import the pg driver only for types`).toBe(true);
          const target = spec.match(/^@\/modules\/([^/]+)\//)?.[1];
          if (target && target !== module) expect(allowed, `${module} must not import ${target} (${file})`).toContain(target);
          // data may use rules of the modules it depends on, but only through their public folders
          if (target) expect(spec, `${file}: ${spec}`).toMatch(/^@\/modules\/[^/]+\/(rules|data)\//);
        }
      }
    });
  }

  it("the tenant is set in ONE place: only src/db/client.ts talks about app.barbershop_id", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") && !path.includes("/src/test/")) {
          if (/app\.barbershop_id|set_config/.test(readFileSync(path, "utf8")) && !path.endsWith("src/db/client.ts")) offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
