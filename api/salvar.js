import { neon } from "@neondatabase/serverless";

const REQUIRED_FIELDS = ["estudo", "lider", "ministerio", "respostas"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL não configurada no ambiente da Vercel.",
    });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const missingField = REQUIRED_FIELDS.find((field) => !payload?.[field]);

    if (missingField) {
      return res.status(400).json({
        error: `Campo obrigatório ausente: ${missingField}.`,
      });
    }

    const sql = neon(process.env.DATABASE_URL);
    const leaderId = payload.lider?.id ? String(payload.lider.id) : null;
    const leaderName = payload.lider?.nome ? String(payload.lider.nome) : null;
    const ministry = String(payload.ministerio || "").trim();
    const studyId = payload.estudo?.id ? String(payload.estudo.id) : null;
    const studyTitle = payload.estudo?.titulo ? String(payload.estudo.titulo) : null;
    const whatsappSummary = payload.resumo_whatsapp
      ? String(payload.resumo_whatsapp)
      : null;

    if (!leaderId || !leaderName || !ministry || !studyId || !studyTitle) {
      return res.status(400).json({
        error: "Payload incompleto para salvar a resposta do discipulado.",
      });
    }

    const [saved] = await sql`
      insert into respostas_discipulado (
        lider_id,
        lider_nome,
        ministerio,
        estudo_id,
        estudo_titulo,
        respostas,
        resumo_whatsapp,
        payload
      )
      values (
        ${leaderId},
        ${leaderName},
        ${ministry},
        ${studyId},
        ${studyTitle},
        ${JSON.stringify(payload.respostas)}::jsonb,
        ${whatsappSummary},
        ${JSON.stringify(payload)}::jsonb
      )
      returning id
    `;

    return res.status(201).json({
      ok: true,
      id: saved.id,
    });
  } catch (error) {
    console.error("Erro ao salvar respostas_discipulado", error);
    return res.status(500).json({
      error: "Não foi possível salvar as respostas.",
    });
  }
}
