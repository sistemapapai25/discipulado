# Discipulado Lideres

WebApp mobile-first para discipulado da igreja, com modulos em video, questionario, validacao de usuarios no Supabase church360 e envio para API Serverless na Vercel.

## Arquivos principais

- `index.html`: estrutura da aplicacao.
- `styles.css`: layout responsivo e estilo visual.
- `app.js`: configuracao do estudo, fluxo dos modulos e envio.
- `api/acesso.js`: Vercel Serverless Function que valida o e-mail do usuario no Supabase church360.
- `api/admin.js`: Vercel Serverless Function que valida a senha administrativa para criar e editar assuntos.
- `api/assuntos.js`: Vercel Serverless Function que lista, cria, edita e configura a liberacao dos assuntos de discipulado no Neon.
- `api/salvar.js`: Vercel Serverless Function que grava no Neon e devolve o progresso do lider.
- `sql/seed-assunto-gloria.sql`: insert inicial do assunto "Aumentando os Niveis de Gloria" no Neon.
- `sql/migracao-liberacao-assuntos.sql`: adiciona as colunas de ordem e liberacao dos assuntos.

## Configuracao

1. Em `app.js`, preencha:
   - `CHURCH_CONFIG.name`
   - `CHURCH_CONFIG.logoUrl`
   - `ADMIN_ALLOWED_EMAILS` para controlar quais e-mails veem a opcao de liberar edicao no menu
   - `YOUTUBE_VIDEO_ID`

2. Na Vercel, configure as variaveis de ambiente:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` para a funcao serverless ler o church360 sem bloqueio de RLS
   - `STUDY_ADMIN_PASSWORD` para liberar os botoes de criar e editar assuntos
   - `STUDY_ADMIN_EMAILS` opcional, com os e-mails autorizados a liberar edicao; por padrao usa `apbergpapai@gmail.com`
   - `STUDY_ADMIN_TOKEN_SECRET` opcional, para assinar o token temporario de edicao

3. Instale a dependencia da funcao serverless:

```bash
npm install
```

4. Rode localmente com Vercel:

```bash
npx vercel dev
```

## Tabela Neon esperada

A funcao `api/salvar.js` espera uma tabela de respostas com colunas equivalentes a:

```sql
create table if not exists respostas_discipulado (
  id uuid primary key default gen_random_uuid(),
  lider_id text not null,
  lider_nome text not null,
  ministerio text not null,
  estudo_id text not null,
  estudo_titulo text not null,
  respostas jsonb not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

A funcao `api/assuntos.js` espera uma tabela para os assuntos cadastrados:

```sql
create table if not exists assuntos_discipulado (
  id text primary key,
  titulo text not null,
  pregador text,
  youtube_video_id text,
  modulos jsonb not null,
  ativo boolean not null default true,
  ordem integer,
  liberado boolean not null default true,
  exige_anterior boolean not null default true,
  criado_por_id text,
  criado_por_nome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Se a tabela ja existe sem `ordem`, `liberado` e `exige_anterior`, rode `sql/migracao-liberacao-assuntos.sql`. A funcao `api/assuntos.js` tambem cria essas colunas sozinha na primeira leitura ou gravacao.

Depois de criar a tabela, rode o seed inicial se quiser cadastrar o assunto que antes estava fixo no codigo:

```sql
-- arquivo: sql/seed-assunto-gloria.sql
```

O app nao traz assuntos fixos no front-end. O menu principal carrega os assuntos da tabela `assuntos_discipulado`. A opcao de liberar edicao so aparece para e-mails administrativos. Depois da senha ser validada pela funcao `/api/admin`, os botoes de configurar liberacao, criar e editar assuntos ficam disponiveis, e `POST`/`PUT`/`PATCH` em `/api/assuntos` tambem exigem token administrativo.

## Liberacao dos assuntos

O menu principal lista os assuntos na ordem definida pela liderança e mostra um cadeado nos que ainda nao podem ser feitos. O botao "Configurar liberacao" abre a tela onde o administrador define, para cada assunto:

- a **ordem** na fila (setas para cima e para baixo);
- se esta **liberado** para os lideres (chave manual, para segurar um assunto ate a hora certa);
- se **exige concluir o assunto anterior** (o lider so abre este assunto depois de responder todos os modulos do anterior liberado).

Regras de leitura do cadeado:

- assunto nao liberado: bloqueado para todo mundo, com o aviso "Ainda nao liberado pela lideranca";
- assunto que exige o anterior: bloqueado ate a pessoa concluir todos os modulos do assunto liberado imediatamente acima na fila;
- o primeiro assunto liberado da fila nunca fica bloqueado por pre-requisito, mesmo com a opcao ligada;
- enquanto a senha administrativa estiver validada, o administrador enxerga todos os assuntos abertos (com o aviso do motivo), para conseguir testar.

Assuntos novos nascem com `liberado = true` e `exige_anterior = true`, entrando no fim da fila.

A tela usa `PATCH /api/assuntos` com `{ settings: [{ id, order, released, requiresPrevious }] }` e o header `X-Admin-Token`.

O progresso de cada lider vem de `GET /api/salvar?lider_id=<id>`, que devolve `{ progress: { "<estudo_id>": ["modulo-1", "modulo-2"] } }` com os modulos ja gravados no Neon.

## Supabase church360

O Supabase church360 e usado como fonte de validacao do e-mail em usuarios ativos e, quando houver, para exibir os departamentos vinculados ao usuario. Nenhuma tabela nova precisa ser criada no Supabase.

Por padrao, a funcao de acesso consulta:

- `user_account`
- `ministry_member`
- `ministry`

O app chama `/api/acesso`, que libera o acesso quando encontra o e-mail em `user_account` com `is_active = true`. Depois disso, tenta carregar departamentos por `ministry_member` e `ministry` apenas para exibicao. A falta de departamento nao bloqueia o acesso nem o envio das respostas.

As respostas do questionario sao gravadas somente no Neon pela funcao `api/salvar.js`. Durante o discipulado, cada modulo respondido gera ou atualiza um registro proprio do envio atual, identificado por `payload.metadados.tipo_registro = "modulo"` e `payload.metadados.envio_id`. Ao entrar novamente e selecionar o mesmo assunto, o app consulta o ultimo envio do usuario em `respostas_discipulado` e preenche as respostas ja salvas.
