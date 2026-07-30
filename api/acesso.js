import {
  buildLeaderResponse,
  createChurch360Client,
  findActivePersonByEmail,
  findDepartmentsByUserId,
  getPersonFirstName,
  hasServiceRoleKey,
  isChurch360Configured,
} from "../lib/church360.js";
import {
  consumeVerificationCode,
  ensureCredentialTables,
  findCredentialByEmail,
  generateVerificationCode,
  getSql,
  savePassword,
  saveVerificationCode,
  validatePasswordStrength,
  verifyPassword,
} from "../lib/credenciais.js";
import { isEmailConfigured, sendVerificationCodeEmail } from "../lib/email.js";
import { checkRateLimit, getClientIp, registerAttempt } from "../lib/rate-limit.js";
import { createLeaderToken, isSessionSecretConfigured } from "../lib/session-auth.js";

const ACTIONS = [
  "status",
  "enviar-codigo",
  "definir-senha",
  "entrar",
  "trocar-senha",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!isChurch360Configured()) {
    return res.status(500).json({
      error:
        "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.",
    });
  }

  if (!isSessionSecretConfigured()) {
    return res.status(500).json({
      error:
        "Configure STUDY_SESSION_SECRET nas variáveis de ambiente da Vercel para assinar a sessão do líder.",
    });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL não configurada no ambiente da Vercel.",
    });
  }

  let payload = {};

  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const action = String(payload.acao || "status").trim();
  const email = normalizeEmail(payload.email);

  if (!ACTIONS.includes(action)) {
    return res.status(400).json({ error: "Ação desconhecida." });
  }

  if (!email) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }

  res.setHeader("Cache-Control", "no-store");

  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit("acesso", ip);

  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({
      error:
        "Muitas tentativas deste dispositivo. Aguarde alguns minutos e tente novamente.",
    });
  }

  try {
    const sql = getSql();
    await ensureCredentialTables(sql);

    switch (action) {
      case "status":
        return await handleStatus({ req, res, sql, email });
      case "enviar-codigo":
        return await handleSendCode({ req, res, sql, email, payload, ip });
      case "definir-senha":
        return await handleSetPassword({ req, res, sql, email, payload });
      case "entrar":
        return await handleSignIn({ req, res, sql, email, payload });
      case "trocar-senha":
        return await handleChangePassword({ req, res, sql, email, payload });
      default:
        return res.status(400).json({ error: "Ação desconhecida." });
    }
  } catch (error) {
    console.error("Erro no acesso do líder", error);
    return res.status(500).json({
      error: error.message || "Não foi possível validar seu acesso.",
    });
  }
}

/**
 * Diz se o e-mail é de um membro ativo e se já tem senha, para o aplicativo
 * saber qual tela mostrar: criar senha ou pedir a senha.
 */
async function handleStatus({ req, res, sql, email }) {
  const person = await findMemberOrFail({ req, res, email });

  if (!person) {
    return res;
  }

  const credential = await findCredentialByEmail(sql, email);

  return res.status(200).json({
    estado: credential ? "com-senha" : "sem-senha",
    nome: getPersonFirstName(person),
  });
}

async function handleSendCode({ req, res, sql, email, payload, ip }) {
  if (!isEmailConfigured()) {
    return res.status(500).json({
      error:
        "O envio de e-mail ainda não está configurado. Fale com o administrador.",
    });
  }

  const person = await findMemberOrFail({ req, res, email });

  if (!person) {
    return res;
  }

  // Dois limites: por e-mail, para ninguém usar o app para encher a caixa de
  // entrada de outra pessoa; e por dispositivo, para não varrer muitos e-mails.
  for (const [scope, identifier] of [
    ["envio", email],
    ["envio-ip", ip],
  ]) {
    const limit = await checkRateLimit(scope, identifier);

    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({
        error:
          scope === "envio"
            ? "Já enviamos códigos demais para este e-mail. Aguarde alguns minutos e verifique sua caixa de entrada."
            : "Muitos pedidos de código deste dispositivo. Aguarde alguns minutos.",
      });
    }
  }

  const code = generateVerificationCode();
  await saveVerificationCode(sql, email, code);

  await Promise.all([
    registerAttempt("envio", email),
    registerAttempt("envio-ip", ip),
  ]);

  const credential = await findCredentialByEmail(sql, email);

  await sendVerificationCodeEmail({
    to: person.email || email,
    code,
    firstName: getPersonFirstName(person),
    purpose: credential ? "redefinir" : "criar",
  });

  return res.status(200).json({
    ok: true,
    destino: maskEmail(person.email || email),
  });
}

async function handleSetPassword({ req, res, sql, email, payload }) {
  const code = String(payload.codigo || "").replace(/\D/g, "");
  const password = String(payload.senha || "");

  if (code.length !== 6) {
    return res.status(400).json({ error: "Informe o código de 6 dígitos." });
  }

  const strengthError = validatePasswordStrength(password);

  if (strengthError) {
    return res.status(400).json({ error: strengthError });
  }

  const person = await findMemberOrFail({ req, res, email });

  if (!person) {
    return res;
  }

  const codeResult = await consumeVerificationCode(sql, email, code);

  if (!codeResult.ok) {
    await registerAttempt("acesso", getClientIp(req));
    return res.status(400).json({ error: codeResult.error });
  }

  await savePassword(sql, {
    leaderId: String(person.id),
    email: person.email || email,
    password,
  });

  return res.status(200).json(await buildSignedInResponse(person, email));
}

async function handleSignIn({ req, res, sql, email, payload }) {
  const password = String(payload.senha || "");

  if (!password) {
    return res.status(400).json({ error: "Informe sua senha." });
  }

  const credential = await findCredentialByEmail(sql, email);

  if (!credential || !(await verifyPassword(password, credential.senha_hash))) {
    await registerAttempt("acesso", getClientIp(req));
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }

  if (credential.senha_temporaria && credential.senha_expirada) {
    return res.status(401).json({
      error:
        "Esta senha temporária venceu. Peça uma nova ao administrador ou use 'Esqueci minha senha'.",
    });
  }

  // Senha temporária não abre o aplicativo: ela só serve para provar quem é a
  // pessoa e trocar por uma senha própria. Por isso não devolve token aqui.
  if (credential.senha_temporaria) {
    return res.status(200).json({ precisaTrocarSenha: true });
  }

  const person = await findMemberOrFail({ req, res, email });

  if (!person) {
    return res;
  }

  return res.status(200).json(await buildSignedInResponse(person, email));
}

/**
 * Troca a senha temporária por uma definitiva. Não pede código: quem digitou a
 * senha temporária certa já provou que a recebeu do administrador.
 */
async function handleChangePassword({ req, res, sql, email, payload }) {
  const currentPassword = String(payload.senhaAtual || "");
  const newPassword = String(payload.senha || "");

  if (!currentPassword) {
    return res.status(400).json({ error: "Informe a senha temporária." });
  }

  const strengthError = validatePasswordStrength(newPassword);

  if (strengthError) {
    return res.status(400).json({ error: strengthError });
  }

  const credential = await findCredentialByEmail(sql, email);

  if (
    !credential ||
    !(await verifyPassword(currentPassword, credential.senha_hash))
  ) {
    await registerAttempt("acesso", getClientIp(req));
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  }

  if (credential.senha_temporaria && credential.senha_expirada) {
    return res.status(401).json({
      error:
        "Esta senha temporária venceu. Peça uma nova ao administrador ou use 'Esqueci minha senha'.",
    });
  }

  const person = await findMemberOrFail({ req, res, email });

  if (!person) {
    return res;
  }

  await savePassword(sql, {
    leaderId: String(person.id),
    email: person.email || email,
    password: newPassword,
    temporary: false,
  });

  return res.status(200).json(await buildSignedInResponse(person, email));
}

async function buildSignedInResponse(person, email) {
  const supabase = createChurch360Client();
  const departments = await findDepartmentsByUserId(supabase, person.id);
  const response = buildLeaderResponse(person, departments, email);

  return {
    token: createLeaderToken(String(person.id)),
    ...response,
  };
}

/**
 * Devolve a pessoa do church360 ou já responde o erro. Quem chama precisa
 * checar o retorno: null significa que a resposta HTTP já foi enviada.
 */
async function findMemberOrFail({ req, res, email }) {
  const supabase = createChurch360Client();
  const person = await findActivePersonByEmail(supabase, email);

  if (!person) {
    await registerAttempt("acesso", getClientIp(req));

    res.status(404).json({
      error: hasServiceRoleKey()
        ? "E-mail não encontrado como usuário ativo no church360."
        : "Não foi possível ler este e-mail no church360. Configure SUPABASE_SERVICE_ROLE_KEY na Vercel para a função acessar user_account sem bloqueio de RLS.",
    });

    return null;
  }

  return person;
}

function maskEmail(email) {
  const [user, domain] = String(email || "").split("@");

  if (!user || !domain) {
    return "";
  }

  const visible = user.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

function normalizeEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ? normalizedEmail
    : "";
}
