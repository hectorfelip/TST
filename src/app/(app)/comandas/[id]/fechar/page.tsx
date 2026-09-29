import { notFound } from "next/navigation";
import { ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { clientName, comandas, comandaTotal, paymentMethodLabel, type PaymentMethod } from "@/prototype/mock-data";

const methods: PaymentMethod[] = ["pix", "dinheiro", "debito", "credito"];

export default async function CloseComandaPage(props: PageProps<"/comandas/[id]/fechar">) {
  const { id } = await props.params;
  const comanda = comandas.find((c) => c.id === id);
  if (!comanda) notFound();

  return (
    <>
      <PageHeader title={`Fechar #${comanda.number}`} subtitle={clientName(comanda.clientId)} />

      <Card>
        <div className={styles.total}>
          <span>Total a pagar</span>
          <Money cents={comandaTotal(comanda)} />
        </div>
      </Card>

      <Card title="Forma de pagamento">
        <div className={styles.buttonGrid}>
          {methods.map((m) => (
            <ButtonLink key={m} href="/comandas" variant="secondary">{paymentMethodLabel[m]}</ButtonLink>
          ))}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="cash">Dinheiro recebido (para calcular troco)</label>
          <input id="cash" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" />
        </div>
        <Note>Desconto: só o dono pode dar (regra do passo 3).</Note>
      </Card>

      <ButtonLink href="/comandas" block>Confirmar pagamento</ButtonLink>
      <ButtonLink href={`/comandas/${comanda.id}`} variant="secondary" block>Voltar</ButtonLink>
    </>
  );
}
