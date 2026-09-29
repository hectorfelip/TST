import { Badge, ButtonLink, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { products } from "@/prototype/mock-data";

export default function InventoryPage() {
  const groups = [
    { title: "Para venda", items: products.filter((p) => p.use === "venda") },
    { title: "Uso interno", items: products.filter((p) => p.use === "interno") },
  ];

  return (
    <>
      <PageHeader title="Estoque" action={<ButtonLink href="/estoque">+ Novo produto</ButtonLink>} />
      {groups.map((g) => (
        <Card key={g.title} title={g.title}>
          <ul className={styles.list}>
            {g.items.map((p) => (
              <li key={p.id} className={styles.row}>
                <span className={styles.rowMain}>
                  <span>{p.name}</span>
                  <span className={styles.rowMeta}>
                    {p.price > 0 ? <Money cents={p.price} /> : "Sem preço de venda"} · mínimo {p.minStock}
                  </span>
                </span>
                <Badge tone={p.stock < p.minStock ? "warning" : "neutral"}>{p.stock} un.</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <div className={styles.buttonGrid}>
        <ButtonLink href="/estoque" variant="secondary">Entrada de mercadoria</ButtonLink>
        <ButtonLink href="/estoque" variant="secondary">Ajuste / perda</ButtonLink>
      </div>
      <Note>Produto vendido em comanda sai do estoque sozinho.</Note>
    </>
  );
}
