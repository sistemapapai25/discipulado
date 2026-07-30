import {
  getAdminTokenFromRequest,
  verifyAdminToken,
} from "../lib/admin-auth.js";
import {
  createChurch360Client,
  findActivePersonByEmail,
  getPersonName,
  isChurch360Configured,
  searchActivePeople,
} from "../lib/church360.js";
import {
  ensureCredentialTables,
  findCredentialsByEmails,
  generateTemporaryPassword,
  getSql,
  savePassword,
} from "../lib/credenciais.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!isChurch360Configured()) {
    return res.status(500).json({
      error: "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.",
    });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL não configurada no ambiente da Vercel.",
    });
  }

  // Tela do administrador: exige o token da senha administrativa.
  if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
    return res.status(401).json({
      error: "Informe a senha administrativa para gerenciar o acesso dos líderes.",
    });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const sql = getSql();
    await ensureCredentialTables(sql);

    if (req.method === "GET") {
      return await handleList(req, res, sql);
    }

    return await handleReset(req, res, sql);
  } catch (error) {
    console.error("Erro ao gerenciar acesso dos líderes", error);
    return res.status(500).json({
      error: error.message || "Não foi possível carregar os líderes.",
    });
  }
}

async function handleList(req, res, sql) {
  const params = getRequestParams(req);
  const term = String(params.get("busca") || "").trim();

  const supabase = createChurch360Client();
  const people = await searchActivePeople(supabase, term);
  const credentials = await findCredentialsByEmails(
    sql,
    people.map((person) => person.email),
  );

  const leaders = people.map((person) => {
    const credential = credentials.get(String(person.email).toLowerCase());

    return {
      id: String(person.id),
      name: getPersonName(person),
      email: person.email,
      estado: getCredentialState(credential),
    };
  });

  return res.status(200).json({ leaders });
}

async function handleReset(req, res, sql) {
  let payload = {};

  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Payload inválido." });
  }

  const email = String(payload.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Informe o e-mail do líder." });
  }

  const supabase = createChurch360Client();
  const person = await findActivePersonByEmail(supabase, email);

  if (!person) {
    return res.status(404).json({
      error: "E-mail não encontrado como usuário ativo no church360.",
    });
  }

  const temporaryPassword = generateTemporaryPassword();

  await savePassword(sql, {
    leaderId: String(person.id),
    email: person.email || email,
    password: temporaryPassword,
    temporary: true,
  });

  // A senha só aparece aqui, uma vez: no banco fica só o hash.
  return res.status(200).json({
    ok: true,
    nome: getPersonName(person),
    email: person.email || email,
    senhaTemporaria: temporaryPassword,
    validaAte: "48 horas",
  });
}

function getCredentialState(credential) {
  if (!credential) {
    return "sem-senha";
  }

  if (credential.senha_temporaria) {
    return credential.senha_expirada ? "temporaria-expirada" : "temporaria";
  }

  return "com-senha";
}

function getRequestParams(req) {
  if (req.query && typeof req.query === "object") {
    return new URLSearchParams(
      Object.entries(req.query).map(([key, value]) => [
        key,
        Array.isArray(value) ? value[0] : value,
      ]),
    );
  }

  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);
  return url.searchParams;
}
