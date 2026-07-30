const DEFAULT_SERIES_ID = "serie-inicial";
const DEFAULT_SERIES_TITLE = "Discipulado";

export function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    /column .* does not exist/i.test(String(error?.message || ""))
  );
}

export function isMissingTableError(error) {
  return (
    error?.code === "42P01" ||
    /relation .* does not exist/i.test(String(error?.message || ""))
  );
}

/**
 * Cria a tabela de séries, liga os assuntos a uma série e preenche as colunas
 * de liberação. É chamada sob demanda: as leituras só pagam esse custo quando o
 * banco ainda está no formato antigo.
 */
export async function ensureSchema(sql) {
  await sql`
    create table if not exists series_discipulado (
      id text primary key,
      titulo text not null,
      descricao text,
      ordem integer,
      liberado boolean not null default true,
      ativo boolean not null default true,
      criado_por_id text,
      criado_por_nome text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  try {
    await sql`
      alter table assuntos_discipulado
        add column if not exists serie_id text,
        add column if not exists ordem integer,
        add column if not exists liberado boolean not null default true,
        add column if not exists exige_anterior boolean not null default true,
        add column if not exists updated_at timestamptz not null default now()
    `;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw error;
    }

    console.warn("Não foi possível ajustar assuntos_discipulado", error?.message);
  }

  // Assunto sem série cai numa série inicial, que o administrador renomeia depois.
  await sql`
    insert into series_discipulado (id, titulo, ordem, liberado, ativo)
    select ${DEFAULT_SERIES_ID}, ${DEFAULT_SERIES_TITLE}, 1, true, true
    where exists (
      select 1 from assuntos_discipulado where serie_id is null
    )
    and not exists (
      select 1 from series_discipulado where id = ${DEFAULT_SERIES_ID}
    )
  `;

  await sql`
    update assuntos_discipulado
    set serie_id = ${DEFAULT_SERIES_ID}
    where serie_id is null
  `;

  await sql`
    update series_discipulado as serie
    set ordem = posicao.linha
    from (
      select
        id,
        row_number() over (order by created_at asc, id asc) as linha
      from series_discipulado
    ) as posicao
    where serie.id = posicao.id
      and serie.ordem is null
  `;

  // A ordem do assunto passa a valer dentro da série.
  await sql`
    update assuntos_discipulado as assunto
    set ordem = posicao.linha
    from (
      select
        id,
        row_number() over (
          partition by serie_id
          order by ordem asc nulls last, created_at asc, id asc
        ) as linha
      from assuntos_discipulado
    ) as posicao
    where assunto.id = posicao.id
      and assunto.ordem is null
  `;
}

export function makeEntityId(title, fallback = "item") {
  const slug =
    String(title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || fallback;

  return `${slug}-${Date.now()}`;
}

export function rowToSeries(row) {
  if (!row?.id || !row?.titulo) {
    return null;
  }

  const order = Number(row.ordem);

  return {
    id: String(row.id),
    title: row.titulo,
    description: row.descricao || "",
    order: Number.isFinite(order) && order > 0 ? order : 0,
    released: row.liberado !== false,
    createdAt: row.created_at,
  };
}

export async function listSeries(sql) {
  const rows = await sql`
    select
      id,
      titulo,
      descricao,
      ordem,
      liberado,
      created_at
    from series_discipulado
    where ativo = true
    order by ordem asc nulls last, created_at asc
  `;

  return rows.map(rowToSeries).filter(Boolean);
}
