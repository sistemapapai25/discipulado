import { neon } from "@neondatabase/serverless";

const WINDOW_SECONDS = 10 * 60;
const MAX_FAILURES = 10;

/**
 * Limite por IP contando apenas tentativas que falharam. Login que dá certo não
 * pontua — vários líderes atrás do mesmo IP (wi-fi da igreja) não se atrapalham,
 * enquanto uma varredura de e-mails, que é quase toda falha, trava rápido.
 *
 * Falha aberto de propósito: se o Neon estiver fora, é melhor deixar o líder
 * entrar do que derrubar o login inteiro por causa do contador.
 */
export async function checkAccessRateLimit(req) {
  const key = getClientKey(req);
  const sql = getSql();

  if (!sql || !key) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  try {
    await ensureRateLimitTable(sql);

    const [row] = await sql`
      select contagem, janela_inicio
      from tentativas_acesso
      where chave = ${key}
        and janela_inicio > now() - make_interval(secs => ${WINDOW_SECONDS})
    `;

    if (!row || row.contagem < MAX_FAILURES) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: getRetryAfterSeconds(row.janela_inicio),
    };
  } catch (error) {
    console.warn("Não foi possível checar o limite de tentativas de acesso", error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function registerAccessFailure(req) {
  const key = getClientKey(req);
  const sql = getSql();

  if (!sql || !key) {
    return;
  }

  try {
    await ensureRateLimitTable(sql);

    await sql`
      insert into tentativas_acesso (chave, janela_inicio, contagem)
      values (${key}, now(), 1)
      on conflict (chave) do update
      set
        janela_inicio = case
          when tentativas_acesso.janela_inicio
               > now() - make_interval(secs => ${WINDOW_SECONDS})
          then tentativas_acesso.janela_inicio
          else now()
        end,
        contagem = case
          when tentativas_acesso.janela_inicio
               > now() - make_interval(secs => ${WINDOW_SECONDS})
          then tentativas_acesso.contagem + 1
          else 1
        end
    `;
  } catch (error) {
    console.warn("Não foi possível registrar a tentativa de acesso", error);
  }
}

async function ensureRateLimitTable(sql) {
  await sql`
    create table if not exists tentativas_acesso (
      chave text primary key,
      janela_inicio timestamptz not null default now(),
      contagem integer not null default 0
    )
  `;
}

function getSql() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

function getRetryAfterSeconds(windowStart) {
  const startedAt = new Date(windowStart).getTime();

  if (!Number.isFinite(startedAt)) {
    return WINDOW_SECONDS;
  }

  const remainingMs = startedAt + WINDOW_SECONDS * 1000 - Date.now();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function getClientKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const rawForwardedFor = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor || "";
  const ip =
    rawForwardedFor.split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim();

  return ip ? `acesso:${ip}` : "";
}
