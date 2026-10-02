import { ActionForm, SubmitButton } from "@/components/action-form";
import { NoAccess } from "@/components/no-access";
import { Badge, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { adjustAction, createProductAction, purchaseAction, stockOutAction } from "@/modules/inventory/api/actions";
import { loadProducts, type ProductRow } from "@/modules/inventory/api/queries";
import { requireAction } from "@/server/auth";

function ProductPicker({ products, id }: { products: ProductRow[]; id: string }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>Produto</label>
      <select id={id} name="productId" className={styles.input} required>
        <option value="">Escolha…</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} un.)</option>)}
      </select>
    </div>
  );
}

export default async function InventoryPage() {
  if (!(await requireAction("inventory.manage"))) return <NoAccess />;
  const products = await loadProducts();
  const groups = [
    { title: "Para venda", items: products.filter((p) => p.use === "sale") },
    { title: "Uso interno", items: products.filter((p) => p.use === "internal") },
  ];

  return (
    <>
      <PageHeader title="Estoque" />
      {groups.map((g) => (
        <Card key={g.title} title={g.title}>
          {g.items.length === 0 ? (
            <p className={styles.rowMeta}>Nenhum produto.</p>
          ) : (
            <ul className={styles.list}>
              {g.items.map((p) => (
                <li key={p.id} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>{p.name}</span>
                    <span className={styles.rowMeta}>
                      {p.price !== null && p.price > 0 ? <Money cents={p.price} /> : "Sem preço de venda"} · mínimo {p.minStock}
                    </span>
                  </span>
                  <Badge tone={p.low ? "warning" : "neutral"}>{p.stock} un.</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Card title="Entrada de mercadoria">
        <ActionForm action={purchaseAction} successMessage="Entrada registrada.">
          <ProductPicker products={products} id="in-product" />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="in-qty">Quantidade que chegou</label>
            <input id="in-qty" name="quantity" className={styles.input} inputMode="numeric" required />
          </div>
          <SubmitButton variant="secondary">Registrar entrada</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="Contagem (ajuste)">
        <ActionForm action={adjustAction} successMessage="Ajuste registrado.">
          <ProductPicker products={products} id="adj-product" />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="adj-counted">Quantidade contada na prateleira</label>
            <input id="adj-counted" name="counted" className={styles.input} inputMode="numeric" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="adj-reason">Motivo (obrigatório)</label>
            <input id="adj-reason" name="reason" className={styles.input} placeholder="Ex.: contagem do mês" required />
          </div>
          <SubmitButton variant="secondary">Registrar ajuste</SubmitButton>
        </ActionForm>
        <Note>O sistema guarda a diferença entre o que ele esperava e o que você contou, com o motivo.</Note>
      </Card>

      <Card title="Uso interno ou perda">
        <ActionForm action={stockOutAction} successMessage="Saída registrada.">
          <ProductPicker products={products} id="out-product" />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="out-type">O que aconteceu?</label>
            <select id="out-type" name="type" className={styles.input} defaultValue="internal_use">
              <option value="internal_use">Uso interno</option>
              <option value="loss">Perda (quebrou, venceu…)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="out-qty">Quantidade</label>
            <input id="out-qty" name="quantity" className={styles.input} inputMode="numeric" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="out-reason">Motivo (obrigatório)</label>
            <input id="out-reason" name="reason" className={styles.input} required />
          </div>
          <SubmitButton variant="secondary">Registrar saída</SubmitButton>
        </ActionForm>
      </Card>

      <Card title="Novo produto">
        <ActionForm action={createProductAction} successMessage="Produto criado.">
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-name">Nome</label>
            <input id="np-name" name="name" className={styles.input} required minLength={2} maxLength={80} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-use">Para quê?</label>
            <select id="np-use" name="use" className={styles.input} defaultValue="sale">
              <option value="sale">Para venda</option>
              <option value="internal">Uso interno</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-price">Preço de venda (só para venda)</label>
            <input id="np-price" name="price" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="np-min">Estoque mínimo</label>
            <input id="np-min" name="minStock" className={styles.input} inputMode="numeric" defaultValue="0" required />
          </div>
          <SubmitButton block>Criar produto</SubmitButton>
        </ActionForm>
        <Note>Todo produto novo começa com estoque 0. Use &quot;Entrada de mercadoria&quot; para colocar a quantidade.</Note>
      </Card>
      <Note>Produto vendido em comanda sai do estoque sozinho.</Note>
    </>
  );
}
