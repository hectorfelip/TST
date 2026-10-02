import { notFound } from "next/navigation";
import { ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { DEMO_BARBER_ID, getDemoRole } from "@/prototype/demo-role";
import { NoAccess } from "@/prototype/owner-only";
import { clientName, isComandaOf, comandas, comandaTotal, paymentMethodLabel, type PaymentMethod } from "@/prototype/mock-data";

const methods: PaymentMethod[] = ["pix", "dinheiro", "debito", "credito"];

export default async function CloseComandaPage(props: PageProps<"/comandas/[id]/fechar">) {
  const { id } = await props.params;
  const comanda = comandas.find((c) => c.id === id);
  if (!comanda) notFound();
  const role = await getDemoRole();
  if (role === "barber" && !isComandaOf(comanda, DEMO_BARBER_ID)) return <NoAccess />;

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
      </Card>

      <Card title="Observação (opcional)">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="note">Ex.: pagamento dividido</label>
          <textarea id="note" className={styles.input} rows={2} />
        </div>
        <Note>
          Pagamento dividido fica para a versão 2. Até lá: escolha a forma de maior valor e escreva aqui como foi
          pago (ex.: &quot;R$ 20 dinheiro + R$ 25 Pix&quot;). O dono corrige no fechamento do caixa.
        </Note>
      </Card>

      {role === "owner" ? (
        <Card title="Desconto">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="discount">Valor do desconto</label>
            <input id="discount" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" />
          </div>
          <Note>Só o dono pode dar desconto.</Note>
        </Card>
      ) : (
        <Note>Desconto só pode ser dado pelo dono.</Note>
      )}

      <ButtonLink href="/comandas" block>Confirmar pagamento</ButtonLink>
      <ButtonLink href={`/comandas/${comanda.id}`} variant="secondary" block>Voltar</ButtonLink>
    </>
  );
}
