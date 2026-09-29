"use server";

import { cookies } from "next/headers";
import { DEMO_ROLE_COOKIE } from "./demo-role";

export async function switchDemoRole(formData: FormData) {
  const role = formData.get("role") === "barber" ? "barber" : "owner";
  const cookieStore = await cookies();
  cookieStore.set(DEMO_ROLE_COOKIE, role, { sameSite: "lax", httpOnly: true });
}
