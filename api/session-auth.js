import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isSessionSecretConfigured() {
  return Boolean(getSessionSecret());
}

export function createLeaderToken(leaderId, now = Date.now()) {
  const normalizedLeaderId = normalizeLeaderId(leaderId);

  if (!normalizedLeaderId) {
    throw new Error("Informe o identificador do líder para criar a sessão.");
  }

  const body = `${encodeLeaderId(normalizedLeaderId)}.${now}`;
  return `${body}.${signBody(body)}`;
}

export function getLeaderTokenFromRequest(req) {
  const headerValue = req.headers["x-leader-token"];
  return Array.isArray(headerValue) ? headerValue[0] : headerValue || "";
}

/**
 * Devolve o leaderId assinado no token, ou "" quando o token é inválido,
 * expirado ou assinado com outro segredo. Nunca confie no leaderId que vem
 * pelo corpo ou pela query — só o que sai daqui foi provado pelo servidor.
 */
export function verifyLeaderToken(token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 3) {
    return "";
  }

  const [encodedLeaderId, timestamp, signature] = parts;
  const issuedAt = Number(timestamp);

  if (!encodedLeaderId || !timestamp || !signature || !Number.isFinite(issuedAt)) {
    return "";
  }

  const now = Date.now();
  if (issuedAt > now + TOKEN_CLOCK_SKEW_MS || now - issuedAt > TOKEN_TTL_MS) {
    return "";
  }

  if (!safeCompare(signature, signBody(`${encodedLeaderId}.${timestamp}`))) {
    return "";
  }

  return decodeLeaderId(encodedLeaderId);
}

function signBody(body) {
  const secret = getSessionSecret();

  if (!secret) {
    throw new Error(
      "Configure STUDY_SESSION_SECRET nas variáveis de ambiente da Vercel para assinar a sessão do líder.",
    );
  }

  // O prefixo separa o domínio da assinatura: mesmo caindo no mesmo segredo do
  // administrador, um token de líder nunca vale como token de administrador.
  return createHmac("sha256", secret).update(`lider:${body}`).digest("hex");
}

function getSessionSecret() {
  return (
    process.env.STUDY_SESSION_SECRET ||
    process.env.STUDY_ADMIN_TOKEN_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.STUDY_ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    ""
  );
}

function encodeLeaderId(leaderId) {
  return Buffer.from(leaderId, "utf8").toString("base64url");
}

function decodeLeaderId(encodedLeaderId) {
  try {
    return normalizeLeaderId(
      Buffer.from(encodedLeaderId, "base64url").toString("utf8"),
    );
  } catch {
    return "";
  }
}

function normalizeLeaderId(leaderId) {
  return String(leaderId || "").trim();
}

function safeCompare(firstValue, secondValue) {
  const firstBuffer = Buffer.from(String(firstValue));
  const secondBuffer = Buffer.from(String(secondValue));

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}
