import {
  createAdminToken,
  isAdminPasswordConfigured,
  verifyAdminEmail,
  verifyAdminPassword,
} from "../lib/admin-auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!isAdminPasswordConfigured()) {
    return res.status(500).json({
      error: "Configure STUDY_ADMIN_PASSWORD nas variáveis de ambiente da Vercel.",
    });
  }

  let payload = {};

  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Payload inválido." });
  }

  if (!verifyAdminPassword(payload?.password)) {
    return res.status(401).json({ error: "Senha inválida." });
  }

  if (!verifyAdminEmail(payload?.email)) {
    return res.status(403).json({
      error: "Edição de assuntos disponível apenas para o administrador.",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    token: createAdminToken(),
  });
}
