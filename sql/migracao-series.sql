-- Series de discipulado: Serie > Assunto > Modulo > Perguntas.
-- Rode uma vez no Neon. A funcao api/schema.js tambem aplica isso sozinha,
-- mas rodar aqui deixa voce escolher o nome da primeira serie.

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
);

alter table assuntos_discipulado
  add column if not exists serie_id text,
  add column if not exists ordem integer,
  add column if not exists liberado boolean not null default true,
  add column if not exists exige_anterior boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Primeira serie, com os assuntos que ja existem.
-- Troque o titulo abaixo pelo nome que voce quiser dar a essa serie.
insert into series_discipulado (id, titulo, ordem, liberado, ativo)
select 'serie-inicial', 'Conferencia - Apostolo Jean', 1, true, true
where exists (select 1 from assuntos_discipulado where serie_id is null)
  and not exists (select 1 from series_discipulado where id = 'serie-inicial');

update assuntos_discipulado
set serie_id = 'serie-inicial'
where serie_id is null;

-- Numera as series que ainda nao tem ordem.
update series_discipulado as serie
set ordem = posicao.linha
from (
  select id, row_number() over (order by created_at asc, id asc) as linha
  from series_discipulado
) as posicao
where serie.id = posicao.id
  and serie.ordem is null;

-- A ordem do assunto vale dentro da serie.
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
  and assunto.ordem is null;

-- Conferencia rapida.
select
  serie.ordem as ordem_serie,
  serie.titulo as serie,
  serie.liberado as serie_liberada,
  assunto.ordem as ordem_assunto,
  assunto.titulo as assunto,
  assunto.liberado,
  assunto.exige_anterior
from assuntos_discipulado as assunto
join series_discipulado as serie on serie.id = assunto.serie_id
where assunto.ativo = true and serie.ativo = true
order by serie.ordem, assunto.ordem;
