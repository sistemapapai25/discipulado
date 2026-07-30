import { neon } from "@neondatabase/serverless";
import { randomInt, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

const CODE_TTL_MINUTES = 15;
const CODE_MAX_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 8;

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
    select lider_id, email, senha_hash
    from credenciais_lideres
    where lower(email) = ${normalizeEmail(email)}
    limit 1
  `;

  return row || null;
}

export async function hasPassword(sql, email) {
  return Boolean(await findCredentialByEmail(sql, email));
}

export async function savePassword(sql, { leaderId, email, password }) {
  const senhaHash = await hashSecret(password);
  const normalizedEmail = normalizeEmail(email);

  // Conflito por lider_id e por e-mail: a pessoa pode redefinir a senha, e o
  // mesmo lider nunca deve terminar com duas credenciais.
  await sql`
    insert into credenciais_lideres (lider_id, email, senha_hash)
    values (${leaderId}, ${normalizedEmail}, ${senhaHash})
    on conflict (lider_id) do update
    set
      email = ${normalizedEmail},
      senha_hash = ${senhaHash},
      atualizado_em = now()
  `;
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
