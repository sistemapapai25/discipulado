import { neon } from "@neondatabase/serverless";

const REQUIRED_FIELDS = ["estudo", "lider", "respostas"];

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
    const ministry = String(payload.ministerio || "").trim() || "Não informado";
    const studyId = payload.estudo?.id ? String(payload.estudo.id) : null;
    const studyTitle = payload.estudo?.titulo ? String(payload.estudo.titulo) : null;
    const whatsappSummary = payload.resumo_whatsapp
      ? String(payload.resumo_whatsapp)
      : null;
    const recordType = payload.metadados?.tipo_registro
      ? String(payload.metadados.tipo_registro)
      : "";
    const submissionId = payload.metadados?.envio_id
      ? String(payload.metadados.envio_id)
      : "";
    const moduleId = payload.modulo?.id ? String(payload.modulo.id) : "";

    if (!leaderId || !leaderName || !studyId || !studyTitle) {
      return res.status(400).json({
        error: "Payload incompleto para salvar a resposta do discipulado.",
      });
    }

    if (recordType === "modulo" && submissionId && moduleId) {
      const [existing] = await sql`
        select id
        from respostas_discipulado
        where lider_id = ${leaderId}
          and estudo_id = ${studyId}
          and payload->'metadados'->>'tipo_registro' = 'modulo'
          and payload->'metadados'->>'envio_id' = ${submissionId}
          and payload->'modulo'->>'id' = ${moduleId}
        order by created_at desc
        limit 1
      `;

      if (existing) {
        const [updated] = await sql`
          update respostas_discipulado
          set
            lider_nome = ${leaderName},
            ministerio = ${ministry},
            estudo_titulo = ${studyTitle},
            respostas = ${JSON.stringify(payload.respostas)}::jsonb,
            resumo_whatsapp = ${whatsappSummary},
            payload = ${JSON.stringify(payload)}::jsonb
          where id = ${existing.id}
          returning id
        `;

        return res.status(200).json({
          ok: true,
          id: updated.id,
          updated: true,
        });
      }
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
