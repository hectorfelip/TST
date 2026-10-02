import { redirect } from "next/navigation";
import { Card, styles } from "@/components/ui";
import { getAuth } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: PageProps<"/login">) {
  if (await getAuth()) redirect("/");
  const search = await props.searchParams;
  return (
    <main className={styles.main} style={{ maxWidth: 400, paddingTop: 64 }}>
      <Card title="Entrar">
        <LoginForm passwordChanged={search.senha === "trocada"} />
      </Card>
    </main>
  );
}
