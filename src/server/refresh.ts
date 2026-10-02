import "server-only";
import { revalidatePath } from "next/cache";

/** After any change, every screen shows fresh data (the app is small: simple beats clever). */
export function refreshScreens(): void {
  revalidatePath("/", "layout");
}
