import type { Tx } from "@/db/client";
import type { Role } from "@/shared/tenant";
import type { Employee } from "../rules/employees";

type Row = { id: string; barbershop_id: string; name: string; email: string; role: string; active: boolean };
const COLUMNS = "id, barbershop_id, name, email, role, active";
const toEmployee = (r: Row): Employee => ({ id: r.id, barbershopId: r.barbershop_id, name: r.name, email: r.email, role: r.role as Role, active: r.active });

export async function listEmployees(tx: Tx): Promise<Employee[]> {
  return (await tx.query<Row>(`SELECT ${COLUMNS} FROM employees ORDER BY name`)).map(toEmployee);
}

export async function getEmployee(tx: Tx, id: string): Promise<Employee | null> {
  const r = await tx.maybeOne<Row>(`SELECT ${COLUMNS} FROM employees WHERE id = $1`, [id]);
  return r ? toEmployee(r) : null;
}

export async function insertEmployee(tx: Tx, e: Employee): Promise<void> {
  await tx.query(`INSERT INTO employees (id, barbershop_id, name, email, role, active) VALUES ($1, $2, $3, $4, $5, $6)`, [
    e.id, e.barbershopId, e.name, e.email, e.role, e.active,
  ]);
}

export async function updateEmployee(tx: Tx, e: Employee): Promise<void> {
  await tx.query(`UPDATE employees SET name = $2, role = $3, active = $4 WHERE id = $1`, [e.id, e.name, e.role, e.active]);
}

/** Is the e-mail used by anyone in the whole system? (yes/no only: see email_taken in the migration) */
export async function emailTaken(tx: Tx, email: string): Promise<boolean> {
  return (await tx.one<{ taken: boolean }>("SELECT email_taken($1) AS taken", [email])).taken;
}
