import { neon } from "@neondatabase/serverless";
import {
  getAdminTokenFromRequest,
  isAdminPasswordConfigured,
  verifyAdminToken,
} from "./admin-auth.js";

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

      return res.status(200).json({
        trainings: await listTrainings(sql),
      });
    }

    if (!isAdminPasswordConfigured()) {
      return res.status(500).json({
        error: "Configure STUDY_ADMIN_PASSWORD nas variáveis de ambiente da Vercel.",
      });
    }

    if (!verifyAdminToken(getAdminTokenFromRequest(req))) {
      return res.status(401).json({
        error: "Informe a senha administrativa para criar ou editar assuntos.",
      });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    await ensureReleaseColumns(sql);

    if (req.method === "PATCH") {
      const settings = normalizeReleaseSettings(payload?.settings);

      await sql`
        update assuntos_discipulado as assunto
        set
          ordem = configuracao.ordem,
          liberado = configuracao.liberado,
          exige_anterior = configuracao.exige_anterior,
          updated_at = now()
        from jsonb_to_recordset(${JSON.stringify(settings)}::jsonb)
          as configuracao(id text, ordem int, liberado boolean, exige_anterior boolean)
        where assunto.id = configuracao.id
      `;

      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        ok: true,
        trainings: await listTrainings(sql),
      });
    }

    const isEditing = req.method === "PUT";
    const training = normalizeTrainingPayload(payload, { keepId: isEditing });
    const creator = payload?.creator || {};

    if (isEditing) {
      const [saved] = await sql`
        update assuntos_discipulado
        set
          titulo = ${training.title},
          pregador = ${training.speaker},
          youtube_video_id = ${training.youtubeVideoId || null},
          modulos = ${JSON.stringify(training.modules)}::jsonb,
          payload = ${JSON.stringify(payload)}::jsonb,
          updated_at = now()
        where id = ${training.id}
        returning
          id,
          titulo,
          pregador,
          youtube_video_id,
          modulos,
          created_at
      `;

      if (!saved) {
        return res.status(404).json({
          error: "Assunto não encontrado para atualização.",
        });
      }

      const trainings = await listTrainings(sql);

      return res.status(200).json({
        ok: true,
        training: findTraining(trainings, saved.id) || rowToTraining(saved),
        trainings,
      });
    }

    const [saved] = await sql`
      insert into assuntos_discipulado (
        id,
        titulo,
        pregador,
        youtube_video_id,
        modulos,
        ativo,
        ordem,
        liberado,
        exige_anterior,
        criado_por_id,
        criado_por_nome,
        payload
      )
      values (
        ${training.id},
        ${training.title},
        ${training.speaker},
        ${training.youtubeVideoId || null},
        ${JSON.stringify(training.modules)}::jsonb,
        true,
        (select coalesce(max(ordem), 0) + 1 from assuntos_discipulado),
        true,
        true,
        ${creator.id ? String(creator.id) : null},
        ${creator.name ? String(creator.name) : null},
        ${JSON.stringify(payload)}::jsonb
      )
      returning
        id,
        titulo,
        pregador,
        youtube_video_id,
        modulos,
        created_at
    `;

    const trainings = await listTrainings(sql);

    return res.status(201).json({
      ok: true,
      training: findTraining(trainings, saved.id) || rowToTraining(saved),
      trainings,
    });
  } catch (error) {
    console.error("Erro em assuntos_discipulado", error);

    if (isMissingTableError(error)) {
      const message =
        "Tabela assuntos_discipulado não encontrada no Neon. Crie a tabela antes de cadastrar novos assuntos.";

      if (req.method === "GET") {
        return res.status(200).json({ trainings: [], warning: message });
      }

      return res.status(500).json({ error: message });
    }

    return res.status(500).json({
      error: error.message || "Não foi possível processar os assuntos.",
    });
  }
}

async function ensureReleaseColumns(sql) {
  try {
    await sql`
      alter table assuntos_discipulado
        add column if not exists ordem integer,
        add column if not exists liberado boolean not null default true,
        add column if not exists exige_anterior boolean not null default true,
        add column if not exists updated_at timestamptz not null default now()
    `;

    await sql`
      update assuntos_discipulado as assunto
      set ordem = posicao.linha
      from (
        select
          id,
          row_number() over (order by created_at asc, id asc) as linha
        from assuntos_discipulado
      ) as posicao
      where assunto.id = posicao.id
        and assunto.ordem is null
    `;
  } catch (error) {
    if (error?.code === "42P01") {
      throw error;
    }

    console.warn(
      "Não foi possível ajustar as colunas de liberação dos assuntos",
      error?.message,
    );
  }
}

async function listTrainings(sql) {
  try {
    return await selectTrainings(sql);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }
  }

  // Banco ainda sem as colunas de liberacao: cria na hora e tenta de novo.
  await ensureReleaseColumns(sql);

  try {
    return await selectTrainings(sql);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return selectLegacyTrainings(sql);
  }
}

async function selectTrainings(sql) {
  const rows = await sql`
    select
      id,
      titulo,
      pregador,
      youtube_video_id,
      modulos,
      ordem,
      liberado,
      exige_anterior,
      created_at
    from assuntos_discipulado
    where ativo = true
    order by ordem asc nulls last, created_at asc
  `;

  return rows.map((row) => rowToTraining(row)).filter(Boolean);
}

async function selectLegacyTrainings(sql) {
  const rows = await sql`
    select
      id,
      titulo,
      pregador,
      youtube_video_id,
      modulos,
      created_at
    from assuntos_discipulado
    where ativo = true
    order by created_at asc
  `;

  return rows
    .map((row, index) =>
      rowToTraining({
        ...row,
        ordem: index + 1,
        liberado: true,
        exige_anterior: false,
      }),
    )
    .filter(Boolean);
}

function isMissingColumnError(error) {
  return (
    error?.code === "42703" ||
    /column .* does not exist/i.test(String(error?.message || ""))
  );
}

function normalizeReleaseSettings(settings) {
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
        exige_anterior: item?.requiresPrevious === true,
      };
    })
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error("Envie pelo menos um assunto para configurar.");
  }

  return normalized;
}

function normalizeTrainingPayload(payload, options = {}) {
  const title = String(payload?.title || "").trim();
  const speaker = String(payload?.speaker || "").trim();
  const rawModules = Array.isArray(payload?.modules) ? payload.modules : [];
  const existingId = String(payload?.id || "").trim();

  if (!title) {
    throw new Error("Informe o título do assunto.");
  }

  if (options.keepId && !existingId) {
    throw new Error("Informe o ID do assunto para editar.");
  }

  if (!rawModules.length) {
    throw new Error("Cadastre pelo menos um módulo.");
  }

  const modules = rawModules.map(normalizeModule).filter(Boolean);

  if (!modules.length) {
    throw new Error("Cadastre pelo menos um módulo válido.");
  }

  return {
    id: options.keepId ? existingId : makeTrainingId(title),
    title,
    speaker,
    youtubeVideoId: extractYoutubeVideoId(payload?.youtubeVideoUrl || ""),
    modules,
    source: "neon",
  };
}

function normalizeModule(module, index) {
  const title = String(module?.title || "").trim();
  const questions = Array.isArray(module?.questions)
    ? module.questions.map(normalizeQuestion).filter(Boolean)
    : [];

  if (!title || !questions.length) {
    return null;
  }

  const start = parseTimeToSeconds(module?.startTime);
  const end = parseTimeToSeconds(module?.endTime);

  return {
    id: `modulo-${index + 1}`,
    number: index + 1,
    title,
    timeLabel: buildTimeLabel(module?.startTime, module?.endTime),
    start,
    end,
    videoId: extractYoutubeVideoId(module?.videoUrl || ""),
    videoUrl: String(module?.videoUrl || "").trim(),
    questions: questions.map((question, questionIndex) => ({
      id: `${index + 1}.${questionIndex + 1}`,
      title: `Pergunta ${index + 1}.${questionIndex + 1}`,
      text: question.text,
    })),
  };
}

function normalizeQuestion(question) {
  const text = String(question?.text || question || "").trim();
  return text ? { text } : null;
}

function rowToTraining(row) {
  if (!row?.id || !row?.titulo) {
    return null;
  }

  const order = Number(row.ordem);

  return {
    id: String(row.id),
    title: row.titulo,
    speaker: row.pregador || "",
    youtubeVideoId: row.youtube_video_id || "",
    modules: Array.isArray(row.modulos) ? row.modulos : [],
    order: Number.isFinite(order) && order > 0 ? order : 0,
    released: row.liberado !== false,
    requiresPrevious: row.exige_anterior !== false,
    source: "neon",
    createdAt: row.created_at,
  };
}

function findTraining(trainings, id) {
  return trainings.find((training) => training.id === String(id)) || null;
}

function makeTrainingId(title) {
  const slug =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "assunto";

  return `${slug}-${Date.now()}`;
}

function extractYoutubeVideoId(urlOrId) {
  const value = String(urlOrId || "").trim();

  if (!value) {
    return "";
  }

  if (/^[a-zA-Z0-9_-]{8,}$/.test(value) && !value.includes(".")) {
    return value;
  }

  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&/]+)/,
    /youtu\.be\/([^?&/]+)/,
    /youtube\.com\/shorts\/([^?&/]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function parseTimeToSeconds(time) {
  const value = String(time || "").trim();

  if (!value) {
    return 0;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const parts = value.split(":").map((part) => Number(part));

  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  return parts.reduce((total, part) => total * 60 + part, 0);
}

function buildTimeLabel(startTime, endTime) {
  const start = String(startTime || "").trim();
  const end = String(endTime || "").trim();

  if (start && end) {
    return `${start} a ${end}`;
  }

  return start || end || "Vídeo completo";
}

function isMissingTableError(error) {
  return (
    error?.code === "42P01" ||
    String(error?.message || "").includes("assuntos_discipulado")
  );
}
