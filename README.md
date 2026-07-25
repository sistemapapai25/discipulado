# Discipulado Lideres

WebApp mobile-first para treinamento de lideranca da igreja, com modulos em video, questionario, leitura de lideres no Supabase church360, envio para API Serverless na Vercel e contingencia por WhatsApp.

## Arquivos principais

- `index.html`: estrutura da aplicacao.
- `styles.css`: layout responsivo e estilo visual.
- `app.js`: configuracao do estudo, Supabase, fluxo dos modulos e envio.
- `api/salvar.js`: Vercel Serverless Function que grava no Neon.

## Configuracao

1. Em `app.js`, preencha:
   - `SUPABASE_CONFIG.url`
   - `SUPABASE_CONFIG.anonKey`
   - `YOUTUBE_VIDEO_ID`
   - `PASTOR_WHATSAPP_NUMBER`

2. Na Vercel, configure a variavel de ambiente:
   - `DATABASE_URL`

3. Instale a dependencia da funcao serverless:

```bash
npm install
```

4. Rode localmente com Vercel:

```bash
npx vercel dev
```

## Tabela Neon esperada

A funcao `api/salvar.js` espera uma tabela com colunas equivalentes a:

```sql
create table if not exists respostas_discipulado (
  id uuid primary key default gen_random_uuid(),
  lider_id text not null,
  lider_nome text not null,
  ministerio text not null,
  estudo_id text not null,
  estudo_titulo text not null,
  respostas jsonb not null,
  resumo_whatsapp text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

## Supabase church360

O Supabase church360 e usado apenas como fonte de leitura dos lideres ativos. Nenhuma tabela nova precisa ser criada no Supabase.

Por padrao, o front-end consulta:

- `ministry_member`
- `user_account`
- `ministry`

O app filtra membros com `role` igual a `leader` ou `coordinator`, com `user_account.is_active = true` e `ministry.is_active = true`.

As respostas do questionario sao gravadas somente no Neon pela funcao `api/salvar.js`.
