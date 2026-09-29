import { ButtonLink, Card, styles } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className={styles.main} style={{ maxWidth: 400, paddingTop: 64 }}>
      <Card title="Entrar">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">E-mail</label>
          <input id="email" type="email" className={styles.input} autoComplete="email" />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">Senha</label>
          <input id="password" type="password" className={styles.input} autoComplete="current-password" />
        </div>
        <ButtonLink href="/" block>Entrar</ButtonLink>
      </Card>
    </main>
  );
}
