import "server-only";
/**
 * The database connection of the running application: the restricted role `app_user` (Row Level Security applies).
 * It is the ONLY connection the online app has. The owner's password (migrations, admin scripts) never lives on the server.
 * The pool is kept on `globalThis` so the development server's hot reload does not open a new one every time.
 */
import type { Pool } from "pg";
import { assertSafeAppRole, createPool } from "@/db/client";

type Holder = { app?: Pool; checked?: Promise<void> };
const holder = ((globalThis as { __barbershopDb?: Holder }).__barbershopDb ??= {});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

export async function appPool(): Promise<Pool> {
  if (!holder.app) {
    // Few connections per instance: a transaction pooler (Supabase) shares a small number between all instances.
    holder.app = createPool(required("DATABASE_URL"), { max: Number(process.env.DB_POOL_MAX ?? 5) });
    holder.checked = assertSafeAppRole(holder.app).catch((error: Error) => {
      // An unsafe role is permanent. A network hiccup is not: check again next time.
      if (!/Unsafe database role/.test(error.message)) holder.checked = undefined;
      throw error;
    });
  }
  await holder.checked; // refuses to run if the role could bypass Row Level Security
  return holder.app;
}
