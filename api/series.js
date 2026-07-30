import { neon } from "@neondatabase/serverless";
import {
  getAdminTokenFromRequest,
  isAdminPasswordConfigured,
  verifyAdminToken,
} from "../lib/admin-auth.js";
import {
  ensureSchema,
  isMissingColumnError,
  isMissingTableError,
  listSeries,
  makeEntityId,
} from "../lib/schema.js";

export default async function handler(req, res) {
  if (!["GET", "POST", "PUT", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PUT, PATCH");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL não configurada no ambiente da Vercel.",
    });
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ series: await listSeriesSafely(sql) });
    }

    if (!isAdminPasswordConfigured()) {
      return res.status(500).json({
        error: "Configure STUDY_ADMIN_PASSWORD nas variáveis de ambiente da Vercel.",
      });
    }

    if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
      return res.status(401).json({
        error: "Informe a senha administrativa para criar ou editar séries.",
      });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    await ensureSchema(sql);

    if (req.method === "PATCH") {
      const settings = normalizeSeriesSettings(payload?.settings);

      await sql`
        update series_discipulado as serie
        set
          ordem = configuracao.ordem,
          liberado = configuracao.liberado,
          updated_at = now()
        from jsonb_to_recordset(${JSON.stringify(settings)}::jsonb)
          as configuracao(id text, ordem int, liberado boolean)
        where serie.id = configuracao.id
      `;

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, series: await listSeries(sql) });
    }

    const title = String(payload?.title || "").trim();
    const description = String(payload?.description || "").trim();

    if (!title) {
      return res.status(400).json({ error: "Informe o título da série." });
    }

    if (req.method === "PUT") {
      const id = String(payload?.id || "").trim();

      if (!id) {
        return res.status(400).json({ error: "Informe o ID da série para editar." });
      }

      const [saved] = await sql`
        update series_discipulado
        set titulo = ${title}, descricao = ${description || null}, updated_at = now()
        where id = ${id}
        returning id
      `;

      if (!saved) {
        return res.status(404).json({ error: "Série não encontrada para atualização." });
      }

      const series = await listSeries(sql);
      return res.status(200).json({
        ok: true,
        series,
        serie: series.find((item) => item.id === id) || null,
      });
    }

    const creator = payload?.creator || {};
    const id = makeEntityId(title, "serie");

    await sql`
      insert into series_discipulado (
        id, titulo, descricao, ordem, liberado, ativo, criado_por_id, criado_por_nome
      )
      values (
        ${id},
        ${title},
        ${description || null},
        (select coalesce(max(ordem), 0) + 1 from series_discipulado),
        true,
        true,
        ${creator.id ? String(creator.id) : null},
        ${creator.name ? String(creator.name) : null}
      )
    `;

    const series = await listSeries(sql);
    return res.status(201).json({
      ok: true,
      series,
      serie: series.find((item) => item.id === id) || null,
    });
  } catch (error) {
    console.error("Erro em series_discipulado", error);

    if (isMissingTableError(error)) {
      const message =
        "Tabela assuntos_discipulado não encontrada no Neon. Crie a tabela antes de cadastrar séries.";

      if (req.method === "GET") {
        return res.status(200).json({ series: [], warning: message });
      }

      return res.status(500).json({ error: message });
    }

    return res.status(500).json({
      error: error.message || "Não foi possível processar as séries.",
    });
  }
}

async function listSeriesSafely(sql) {
  try {
    return await listSeries(sql);
  } catch (error) {
    if (!isMissingTableError(error) && !isMissingColumnError(error)) {
      throw error;
    }
  }

  await ensureSchema(sql);
  return listSeries(sql);
}

function normalizeSeriesSettings(settings) {
  const list = Array.isArray(settings) ? settings : [];
  const normalized = list
    .map((item, index) => {
      const id = String(item?.id || "").trim();

      if (!id) {
        return null;
      }

      const order = Number(item?.order);

      return {
        id,
        ordem: Number.isFinite(order) && order > 0 ? Math.trunc(order) : index + 1,
        liberado: item?.released !== false,
      };
    })
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error("Envie pelo menos uma série para configurar.");
  }

  return normalized;
}
