import { neon } from "@neondatabase/serverless";
import { randomInt, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const CODE_TTL_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

const TEMPORARY_PASSWORD_TTL_HOURS = 48;
// Sem 0/O nem 1/I/L: a senha temporaria e ditada por telefone ou copiada a mao.
const TEMPORARY_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const TEMPORARY_DIGITS = "23456789";

export function getSql() {
  return neon(process.env.DATABASE_URL);
}

export async function ensureCredentialTables(sql) {
  await sql`
    create table if not exists credenciais_lideres (
      lider_id text primary key,
      email text not null,
      senha_hash text not null,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now()
    )
  `;

  await sql`
    create unique index if not exists credenciais_lideres_email_idx
      on credenciais_lideres (lower(email))
  `;

  // Colunas da senha temporaria: chegam depois, entao entram por alter.
  await sql`
    alter table credenciais_lideres
      add column if not exists senha_temporaria boolean not null default false,
      add column if not exists senha_expira_em timestamptz
  `;

  await sql`
    create table if not exists codigos_verificacao (
      email text primary key,
      codigo_hash text not null,
      expira_em timestamptz not null,
      tentativas integer not null default 0,
      criado_em timestamptz not null default now()
    )
  `;
}

export async function findCredentialByEmail(sql, email) {
  const [row] = await sql`
    select
      lider_id,
      email,
      senha_hash,
      senha_temporaria,
      senha_expira_em,
      senha_expira_em is not null and senha_expira_em < now() as senha_expirada
    from credenciais_lideres
    where lower(email) = ${normalizeEmail(email)}
    limit 1
  `;

  return row || null;
}

/**
 * Status de senha de varios e-mails de uma vez, para a tela do administrador
 * nao fazer uma consulta por lider.
 */
export async function findCredentialsByEmails(sql, emails) {
  const normalized = emails.map(normalizeEmail).filter(Boolean);

  if (!normalized.length) {
    return new Map();
  }

  const rows = await sql`
    select
      lower(email) as email,
      senha_temporaria,
      senha_expira_em,
      senha_expira_em is not null and senha_expira_em < now() as senha_expirada
    from credenciais_lideres
    where lower(email) = any(${normalized})
  `;

  return new Map(rows.map((row) => [row.email, row]));
}

export async function hasPassword(sql, email) {
  return Boolean(await findCredentialByEmail(sql, email));
}

export async function savePassword(
  sql,
  { leaderId, email, password, temporary = false },
) {
  const senhaHash = await hashSecret(password);
  const normalizedEmail = normalizeEmail(email);
  const isTemporary = Boolean(temporary);
  const horas = TEMPORARY_PASSWORD_TTL_HOURS;

  // O prazo entra por um `case` com parametro numerico: o driver do Neon nao
  // compoe um template dentro do outro.
  await sql`
    insert into credenciais_lideres (
      lider_id, email, senha_hash, senha_temporaria, senha_expira_em
    )
    values (
      ${leaderId},
      ${normalizedEmail},
      ${senhaHash},
      ${isTemporary},
      case when ${isTemporary} then now() + make_interval(hours => ${horas}) else null end
    )
    on conflict (lider_id) do update
    set
      email = ${normalizedEmail},
      senha_hash = ${senhaHash},
      senha_temporaria = ${isTemporary},
      senha_expira_em = case
        when ${isTemporary} then now() + make_interval(hours => ${horas})
        else null
      end,
      atualizado_em = now()
  `;
}

/**
 * Senha temporaria legivel: dois grupos de quatro, com letras e digitos, sem
 * caracteres que se confundem. Sempre tem pelo menos uma letra e um digito.
 */
export function generateTemporaryPassword() {
  const alfabeto = TEMPORARY_LETTERS + TEMPORARY_DIGITS;
  const caracteres = [
    pickRandom(TEMPORARY_LETTERS),
    pickRandom(TEMPORARY_DIGITS),
    ...Array.from({ length: 6 }, () => pickRandom(alfabeto)),
  ];

  // Embaralha para a letra e o digito garantidos nao ficarem sempre na frente.
  for (let index = caracteres.length - 1; index > 0; index -= 1) {
    const alvo = randomInt(0, index + 1);
    [caracteres[index], caracteres[alvo]] = [caracteres[alvo], caracteres[index]];
  }

  return `${caracteres.slice(0, 4).join("")}-${caracteres.slice(4).join("")}`;
}

function pickRandom(alfabeto) {
  return alfabeto[randomInt(0, alfabeto.length)];
}

export function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }

  if (value.length > 200) {
    return "A senha é longa demais.";
  }

  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "A senha precisa ter letras e números.";
  }

  return "";
}

export async function verifyPassword(password, senhaHash) {
  return verifySecret(password, senhaHash);
}

export function generateVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function saveVerificationCode(sql, email, code) {
  const codigoHash = await hashSecret(code);

  await sql`
    insert into codigos_verificacao (email, codigo_hash, expira_em, tentativas, criado_em)
    values (
      ${normalizeEmail(email)},
      ${codigoHash},
      now() + make_interval(mins => ${CODE_TTL_MINUTES}),
      0,
      now()
    )
    on conflict (email) do update
    set
      codigo_hash = ${codigoHash},
      expira_em = now() + make_interval(mins => ${CODE_TTL_MINUTES}),
      tentativas = 0,
      criado_em = now()
  `;
}

/**
 * Confere o código e o consome no caminho de sucesso, para não valer duas vezes.
 * Cada tentativa errada é contada; passando de CODE_MAX_ATTEMPTS o código morre
 * e a pessoa precisa pedir outro.
 */
export async function consumeVerificationCode(sql, email, code) {
  const normalizedEmail = normalizeEmail(email);

  const [row] = await sql`
    select codigo_hash, tentativas, expira_em < now() as expirado
    from codigos_verificacao
    where email = ${normalizedEmail}
    limit 1
  `;

  if (!row) {
    return { ok: false, error: "Peça um novo código para continuar." };
  }

  if (row.expirado) {
    await sql`delete from codigos_verificacao where email = ${normalizedEmail}`;
    return { ok: false, error: "O código expirou. Peça um novo código." };
  }

  if (row.tentativas >= CODE_MAX_ATTEMPTS) {
    await sql`delete from codigos_verificacao where email = ${normalizedEmail}`;
    return {
      ok: false,
      error: "Muitas tentativas com esse código. Peça um novo código.",
    };
  }

  if (!(await verifySecret(code, row.codigo_hash))) {
    await sql`
      update codigos_verificacao
      set tentativas = tentativas + 1
      where email = ${normalizedEmail}
    `;

    const restantes = CODE_MAX_ATTEMPTS - (row.tentativas + 1);

    return {
      ok: false,
      error: restantes > 0
        ? `Código incorreto. Você ainda pode tentar ${restantes} ${restantes === 1 ? "vez" : "vezes"}.`
        : "Código incorreto. Peça um novo código.",
    };
  }

  await sql`delete from codigos_verificacao where email = ${normalizedEmail}`;
  return { ok: true, error: "" };
}

async function hashSecret(secret) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(
    String(secret),
    salt,
    SCRYPT_KEY_LENGTH,
    SCRYPT_OPTIONS,
  );

  return [
    "scrypt",
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

async function verifySecret(secret, storedHash) {
  const parts = String(storedHash || "").split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, n, r, p, saltHex, derivedHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(derivedHex, "hex");

  if (!salt.length || !expected.length) {
    return false;
  }

  const derived = await scryptAsync(String(secret), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
