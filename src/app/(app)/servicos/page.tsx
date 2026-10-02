import { ActionForm, SubmitButton } from "@/components/action-form";
import { NoAccess } from "@/components/no-access";
import { Badge, Card, Money, Note, PageHeader, styles } from "@/components/ui";
import { createServiceAction, setServiceActiveAction, updateServiceAction } from "@/modules/services/api/actions";
import { loadServices, type ServiceRow } from "@/modules/services/api/queries";
import { requireAction } from "@/server/auth";

function ServiceFields({ service }: { service?: ServiceRow }) {
  const id = service?.id ?? "new";
  return (
    <>
      {service && <input type="hidden" name="serviceId" value={service.id} />}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`name-${id}`}>Nome</label>
        <input id={`name-${id}`} name="name" className={styles.input} defaultValue={service?.name} required minLength={2} maxLength={60} />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`price-${id}`}>Preço</label>
        <input id={`price-${id}`} name="price" className={styles.input} inputMode="decimal" placeholder="R$ 0,00" defaultValue={service ? (service.price / 100).toFixed(2).replace(".", ",") : ""} required />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor={`min-${id}`}>Duração (minutos)</label>
        <input id={`min-${id}`} name="minutes" className={styles.input} inputMode="numeric" defaultValue={service?.minutes ?? 30} required />
      </div>
      <label className={styles.row} style={{ cursor: "pointer" }}>
        <span>Favorito (aparece em destaque na comanda)</span>
        <input type="checkbox" name="favorite" value="yes" defaultChecked={service?.favorite ?? false} style={{ width: 24, height: 24 }} />
      </label>
    </>
  );
}

export default async function ServicesPage() {
  if (!(await requireAction("service.manage"))) return <NoAccess />;
  const services = await loadServices();
  return (
    <>
      <PageHeader title="Serviços" />
      <Card>
        <ul className={styles.list}>
          {services.map((s) => (
            <li key={s.id}>
              <details>
                <summary className={styles.row}>
                  <span className={styles.rowMain}>
                    <span>{s.favorite ? "★ " : ""}{s.name}</span>
                    <span className={styles.rowMeta}>{s.minutes} min</span>
                  </span>
                  <span>{s.active ? <strong><Money cents={s.price} /></strong> : <Badge>Inativo</Badge>}</span>
                </summary>
                <ActionForm action={updateServiceAction} successMessage="Serviço salvo.">
                  <ServiceFields service={s} />
                  <SubmitButton>Salvar</SubmitButton>
                </ActionForm>
                <ActionForm action={setServiceActiveAction}>
                  <input type="hidden" name="serviceId" value={s.id} />
                  <input type="hidden" name="active" value={s.active ? "no" : "yes"} />
                  <SubmitButton variant="secondary">{s.active ? "Desativar serviço" : "Reativar serviço"}</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Novo serviço">
        <ActionForm action={createServiceAction} successMessage="Serviço criado.">
          <ServiceFields />
          <SubmitButton block>Criar serviço</SubmitButton>
        </ActionForm>
      </Card>
      <Note>Mudar um preço não altera comandas antigas: elas guardam o preço da época. Serviços não são apagados, só desativados.</Note>
    </>
  );
}
