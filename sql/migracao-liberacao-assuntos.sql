-- Liberacao e ordem dos assuntos de discipulado.
-- Rode uma vez no Neon. A funcao api/assuntos.js tambem aplica isso sozinha,
-- mas rodar aqui deixa o banco pronto antes do primeiro acesso.

alter table assuntos_discipulado
  add column if not exists ordem integer,
  add column if not exists liberado boolean not null default true,
  add column if not exists exige_anterior boolean not null default true;

-- Numera os assuntos que ainda nao tem ordem, do mais antigo para o mais novo.
update assuntos_discipulado as assunto
set ordem = posicao.linha
from (
  select
    id,
    row_number() over (order by created_at asc, id asc) as linha
  from assuntos_discipulado
) as posicao
where assunto.id = posicao.id
  and assunto.ordem is null;

-- Conferencia rapida da configuracao atual.
select
  ordem,
  titulo,
  liberado,
  exige_anterior
from assuntos_discipulado
where ativo = true
order by ordem asc, created_at asc;
