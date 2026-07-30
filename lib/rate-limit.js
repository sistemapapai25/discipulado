import { neon } from "@neondatabase/serverless";

const LIMITS = {
  // Falhas de login por dispositivo: mata a varredura de e-mails e senhas.
  acesso: { windowSeconds: 10 * 60, max: 10 },
  // Envio de código por e-mail: impede usar o app para encher a caixa de
  // entrada de alguém. Conta todo envio, inclusive os que dão certo.
  envio: { windowSeconds: 15 * 60, max: 3 },
  // Envio por dispositivo: impede varrer muitos e-mails pedindo código.
  "envio-ip": { windowSeconds: 15 * 60, max: 8 },
};

/**
 * Limite guardado no Neon, por escopo. O escopo "acesso" conta apenas falhas —
 * login que dá certo não pontua, então vários líderes atrás do mesmo IP (o
 * wi-fi da igreja) não se atrapalham. Os escopos de envio contam todas as
 * chamadas, porque aí o próprio volume é o problema.
 *
 * Falha aberto de propósito: se o Neon estiver fora, é melhor deixar o líder
 * entrar do que derrubar o login inteiro por causa do contador.
 */
export async function checkRateLimit(scope, identifier) {
  const limit = LIMITS[scope];
  const key = buildKey(scope, identifier);
  const sql = getSql();

  if (!sql || !key || !limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  try {
    await ensureRateLimitTable(sql);

    const [row] = await sql`
      select contagem, janela_inicio
      from tentativas_acesso
      where chave = ${key}
        and janela_inicio > now() - make_interval(secs => ${limit.windowSeconds})
    `;

    if (!row || row.contagem < limit.max) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
      allowed: false,
      retryAfterSeconds: getRetryAfterSeconds(row.janela_inicio, limit.windowSeconds),
    };
  } catch (error) {
    console.warn("Não foi possível checar o limite de tentativas", { scope, error });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export async function registerAttempt(scope, identifier) {
  const limit = LIMITS[scope];
  const key = buildKey(scope, identifier);
  const sql = getSql();

  if (!sql || !key || !limit) {
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
               > now() - make_interval(secs => ${limit.windowSeconds})
          then tentativas_acesso.janela_inicio
          else now()
        end,
        contagem = case
          when tentativas_acesso.janela_inicio
               > now() - make_interval(secs => ${limit.windowSeconds})
          then tentativas_acesso.contagem + 1
          else 1
        end
    `;
  } catch (error) {
    console.warn("Não foi possível registrar a tentativa", { scope, error });
  }
}

export function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const rawForwardedFor = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor || "";

  return (
    rawForwardedFor.split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "").trim()
  );
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

function buildKey(scope, identifier) {
  const normalized = String(identifier || "").trim().toLowerCase();
  return normalized ? `${scope}:${normalized}` : "";
}

function getSql() {
  return process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
}

function getRetryAfterSeconds(windowStart, windowSeconds) {
  const startedAt = new Date(windowStart).getTime();

  if (!Number.isFinite(startedAt)) {
    return windowSeconds;
  }

  const remainingMs = startedAt + windowSeconds * 1000 - Date.now();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}
