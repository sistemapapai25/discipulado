import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_ADMIN_EMAILS = ["apbergpapai@gmail.com"];

export function isAdminPasswordConfigured() {
  return Boolean(getAdminPassword());
}

export function verifyAdminPassword(password) {
  const expectedPassword = getAdminPassword();

  if (!expectedPassword) {
    return false;
  }

  return safeCompare(String(password || ""), expectedPassword);
}

export function verifyAdminEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  return Boolean(
    normalizedEmail && getAllowedAdminEmails().includes(normalizedEmail),
  );
}

export function createAdminToken(now = Date.now()) {
  const timestamp = String(now);
  return `${timestamp}.${signTokenTimestamp(timestamp)}`;
}

export function getAdminTokenFromRequest(req) {
  const headerValue = req.headers["x-admin-token"];
  return Array.isArray(headerValue) ? headerValue[0] : headerValue || "";
}

export function verifyAdminToken(token) {
  const [timestamp, signature] = String(token || "").split(".");
  const issuedAt = Number(timestamp);

  if (!timestamp || !signature || !Number.isFinite(issuedAt)) {
    return false;
  }

  const now = Date.now();
  if (issuedAt > now + TOKEN_CLOCK_SKEW_MS || now - issuedAt > TOKEN_TTL_MS) {
    return false;
  }

  return safeCompare(signature, signTokenTimestamp(timestamp));
}

function signTokenTimestamp(timestamp) {
  return createHmac("sha256", getAdminSecret())
    .update(timestamp)
    .digest("hex");
}

function getAdminPassword() {
  return process.env.STUDY_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "";
}

function getAdminSecret() {
  return (
    process.env.STUDY_ADMIN_TOKEN_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    getAdminPassword()
  );
}

function getAllowedAdminEmails() {
  const configuredEmails =
    process.env.STUDY_ADMIN_EMAILS || process.env.STUDY_ADMIN_EMAIL || "";
  const emails = configuredEmails
    .split(/[,\s;]+/)
    .map(normalizeEmail)
    .filter(Boolean);

  return emails.length ? emails : DEFAULT_ADMIN_EMAILS;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function safeCompare(firstValue, secondValue) {
  const firstBuffer = Buffer.from(String(firstValue));
  const secondBuffer = Buffer.from(String(secondValue));

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}
