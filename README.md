# Discipulado Lideres

WebApp mobile-first para discipulado da igreja, com modulos em video, questionario, validacao de usuarios no Supabase church360 e envio para API Serverless na Vercel.

## Arquivos principais

- `index.html`: estrutura da aplicacao.
- `styles.css`: layout responsivo e estilo visual.
- `app.js`: configuracao do estudo, fluxo dos modulos e envio.
- `api/acesso.js`: Vercel Serverless Function que valida o e-mail do usuario no Supabase church360.
- `api/admin.js`: Vercel Serverless Function que valida a senha administrativa para criar e editar assuntos.
- `api/assuntos.js`: Vercel Serverless Function que lista, cria e edita assuntos de discipulado no Neon.
- `api/salvar.js`: Vercel Serverless Function que grava no Neon.
- `sql/seed-assunto-gloria.sql`: insert inicial do assunto "Aumentando os Niveis de Gloria" no Neon.

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
  criado_por_id text,
  criado_por_nome text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Depois de criar a tabela, rode o seed inicial se quiser cadastrar o assunto que antes estava fixo no codigo:

```sql
-- arquivo: sql/seed-assunto-gloria.sql
```

O app nao traz assuntos fixos no front-end. O menu principal carrega os assuntos da tabela `assuntos_discipulado`. A opcao de liberar edicao so aparece para e-mails administrativos. Depois da senha ser validada pela funcao `/api/admin`, os botoes de criar e editar assuntos ficam disponiveis, e `POST`/`PUT` em `/api/assuntos` tambem exigem token administrativo.

## Supabase church360

O Supabase church360 e usado como fonte de validacao do e-mail em usuarios ativos e, quando houver, para exibir os departamentos vinculados ao usuario. Nenhuma tabela nova precisa ser criada no Supabase.

Por padrao, a funcao de acesso consulta:

- `user_account`
- `ministry_member`
- `ministry`

O app chama `/api/acesso`, que libera o acesso quando encontra o e-mail em `user_account` com `is_active = true`. Depois disso, tenta carregar departamentos por `ministry_member` e `ministry` apenas para exibicao. A falta de departamento nao bloqueia o acesso nem o envio das respostas.

As respostas do questionario sao gravadas somente no Neon pela funcao `api/salvar.js`. Durante o discipulado, cada modulo respondido gera ou atualiza um registro proprio do envio atual, identificado por `payload.metadados.tipo_registro = "modulo"` e `payload.metadados.envio_id`. Ao entrar novamente e selecionar o mesmo assunto, o app consulta o ultimo envio do usuario em `respostas_discipulado` e preenche as respostas ja salvas.
