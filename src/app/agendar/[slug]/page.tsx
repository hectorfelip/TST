import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Note, styles } from "@/components/ui";
import { loadPublicBooking } from "@/modules/booking/api/public-queries";
import { formatBRL } from "@/shared/money";
import { PublicBookingForm } from "./booking-form";

// Nobody lists the barbershops: the link is only for people who received it.
export const metadata: Metadata = { title: "Agendar horário", robots: { index: false, follow: false } };

export default async function PublicBookingPage(props: PageProps<"/agendar/[slug]">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const page = await loadPublicBooking(slug, { service: one(search.s), barber: one(search.b), day: one(search.d), time: one(search.h) });
  if (!page) notFound();

  const here = `/agendar/${encodeURIComponent(slug)}`;
  const link = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1]));
    return q.size > 0 ? `${here}?${q}` : here;
  };
  const { service, barber, day, time } = page;
  const dayWord = day ? day.title.replace(" · ", ", ") : "";

  return (
    <main className={styles.main} style={{ maxWidth: 520, paddingTop: 24 }}>
      <div className={styles.pageHeader}>
        <div>
          <h1>{page.shopName}</h1>
          <p className={styles.subtitle}>Agende o seu horário</p>
        </div>
      </div>

      {service && (
        <Card>
          <Choice label="Serviço" value={`${service.name} · ${formatBRL(service.price)} · ${service.durationMinutes} min`} href={link({})} />
          {barber && <Choice label="Barbeiro" value={barber.name} href={link({ s: service.id })} />}
          {barber && day && <Choice label="Dia" value={day.title} href={link({ s: service.id, b: barber.id })} />}
          {barber && day && time && <Choice label="Horário" value={time} href={link({ s: service.id, b: barber.id, d: day.ymd })} />}
        </Card>
      )}

      {!service ? (
        <Card title="1. Escolha o serviço">
          {page.services.length === 0 ? (
            <p>Nenhum serviço disponível agora. Ligue para a barbearia.</p>
          ) : (
            <ul className={styles.list}>
              {page.services.map((s) => (
                <li key={s.id}>
                  <Link href={link({ s: s.id })} className={styles.row}>
                    <span className={styles.rowMain}>
                      <strong>{s.name}</strong>
                      <span className={styles.rowMeta}>{s.durationMinutes} min</span>
                    </span>
                    <strong>{formatBRL(s.price)}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : !barber ? (
        <Card title="2. Com quem?">
          {page.barbers.length === 0 ? (
            <p>Nenhum barbeiro aceita agendamento online agora. Ligue para a barbearia.</p>
          ) : (
            <ul className={styles.list}>
              <li>
                <Link href={link({ s: service.id, b: "any" })} className={styles.row}>
                  <span className={styles.rowMain}>
                    <strong>Qualquer barbeiro</strong>
                    <span className={styles.rowMeta}>Mais horários livres</span>
                  </span>
                </Link>
              </li>
              {page.barbers.map((b) => (
                <li key={b.id}>
                  <Link href={link({ s: service.id, b: b.id })} className={styles.row}>
                    <strong>{b.name}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : !day ? (
        <Card title="3. Escolha o dia">
          {page.days.length === 0 ? (
            <p>Nenhum dia disponível. Ligue para a barbearia.</p>
          ) : (
            <ul className={styles.list}>
              {page.days.map((d) => (
                <li key={d.ymd}>
                  <Link href={link({ s: service.id, b: barber.id, d: d.ymd })} className={styles.row}>
                    <strong>{d.title}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : !time ? (
        <Card title="4. Escolha o horário">
          {page.slots.length === 0 ? (
            <>
              <p>Não há horários livres neste dia.</p>
              <Link href={link({ s: service.id, b: barber.id })} className={styles.buttonSecondary}>Escolher outro dia</Link>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
              {page.slots.map((t) => (
                <Link key={t} href={link({ s: service.id, b: barber.id, d: day.ymd, h: t })} className={styles.buttonSecondary}>{t}</Link>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <PublicBookingForm
          slug={slug}
          serviceId={service.id}
          barberId={barber.id}
          day={day.ymd}
          time={time}
          whenLabel={`${dayWord} às ${time}`}
          requiresApproval={page.requiresApproval}
        />
      )}
      <Note>Os horários mostrados estão livres agora. Se alguém reservar antes de você, avisamos e você escolhe outro.</Note>
    </main>
  );
}

function Choice({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowMain}>
        <span className={styles.rowMeta}>{label}</span>
        <strong>{value}</strong>
      </span>
      <Link href={href} className={styles.rowMeta}>Alterar</Link>
    </div>
  );
}
