import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import {
  getLeaderTokenFromRequest,
  verifyLeaderToken,
} from "../lib/session-auth.js";

const REQUIRED_FIELDS = ["estudo", "lider", "respostas"];

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({
      error: "DATABASE_URL não configurada no ambiente da Vercel.",
    });
  }

  // A identidade sai do token assinado, nunca do corpo nem da query: é isso que
  // impede ler ou gravar no nome de outro líder por fora do aplicativo.
  const leaderId = verifyLeaderToken(getLeaderTokenFromRequest(req));

  if (!leaderId) {
    return res.status(401).json({
      error: "Sua sessão expirou. Entre novamente com seu e-mail.",
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureResponsesTable(sql);

    if (req.method === "GET") {
      return handleGetSavedAnswers(req, res, sql, leaderId);
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const missingField = REQUIRED_FIELDS.find((field) => !payload?.[field]);

    if (missingField) {
      return res.status(400).json({
        error: `Campo obrigatório ausente: ${missingField}.`,
      });
    }

    const leaderName = payload.lider?.nome ? String(payload.lider.nome) : null;
    const ministry = String(payload.ministerio || "").trim() || "Não informado";
    const studyId = payload.estudo?.id ? String(payload.estudo.id) : null;
    const studyTitle = payload.estudo?.titulo ? String(payload.estudo.titulo) : null;
    const recordType = payload.metadados?.tipo_registro
      ? String(payload.metadados.tipo_registro)
      : "";
    const submissionId = payload.metadados?.envio_id
      ? String(payload.metadados.envio_id)
      : "";
    const moduleId = payload.modulo?.id ? String(payload.modulo.id) : "";

    if (!leaderName || !studyId || !studyTitle) {
      return res.status(400).json({
        error: "Payload incompleto para salvar a resposta do discipulado.",
      });
    }

    // Descarta qualquer id que o cliente tenha mandado, para não gravar uma
    // identidade falsa dentro do jsonb.
    payload.lider = { ...(payload.lider || {}), id: leaderId };

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
            nome_lider = ${leaderName},
            ministerio = ${ministry},
            estudo_titulo = ${studyTitle},
            titulo_estudo = ${studyTitle},
            respostas = ${JSON.stringify(payload.respostas)}::jsonb,
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
        id,
        lider_id,
        lider_nome,
        nome_lider,
        ministerio,
        estudo_id,
        estudo_titulo,
        titulo_estudo,
        respostas,
        payload
      )
      values (
        ${randomUUID()},
        ${leaderId},
        ${leaderName},
        ${leaderName},
        ${ministry},
        ${studyId},
        ${studyTitle},
        ${studyTitle},
        ${JSON.stringify(payload.respostas)}::jsonb,
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
      error: getSaveErrorMessage(error),
    });
  }
}

async function handleGetSavedAnswers(req, res, sql, leaderId) {
  const params = getRequestParams(req);
  const studyId = String(params.get("estudo_id") || "").trim();

  if (!studyId) {
    return handleGetLeaderProgress(res, sql, leaderId);
  }

  const [latest] = await sql`
    select payload
    from respostas_discipulado
    where lider_id = ${leaderId}
      and estudo_id = ${studyId}
      and payload->'metadados'->>'tipo_registro' = 'modulo'
    order by created_at desc
    limit 1
  `;

  const submissionId = latest?.payload?.metadados?.envio_id || "";

  if (!submissionId) {
    return res.status(200).json({
      answers: {},
      modules: [],
      submissionId: "",
    });
  }

  const rows = await sql`
    select respostas, payload, created_at
    from respostas_discipulado
    where lider_id = ${leaderId}
      and estudo_id = ${studyId}
      and payload->'metadados'->>'tipo_registro' = 'modulo'
      and payload->'metadados'->>'envio_id' = ${submissionId}
    order by created_at asc
  `;

  return res.status(200).json(normalizeSavedAnswers(rows, submissionId));
}

async function handleGetLeaderProgress(res, sql, leaderId) {
  const rows = await sql`
    select
      estudo_id,
      payload->'modulo'->>'id' as modulo_id
    from respostas_discipulado
    where lider_id = ${leaderId}
      and payload->'metadados'->>'tipo_registro' = 'modulo'
  `;

  const progress = {};

  rows.forEach((row) => {
    const studyId = String(row.estudo_id || "").trim();
    const moduleId = String(row.modulo_id || "").trim();

    if (!studyId || !moduleId) {
      return;
    }

    if (!progress[studyId]) {
      progress[studyId] = [];
    }

    if (!progress[studyId].includes(moduleId)) {
      progress[studyId].push(moduleId);
    }
  });

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ progress });
}

function normalizeSavedAnswers(rows, submissionId) {
  const answers = {};
  const modulesById = new Map();

  rows.forEach((row) => {
    const modulePayload = row.payload?.modulo || null;
    const moduleId = modulePayload?.id ? String(modulePayload.id) : "";
    const responseModules = Array.isArray(row.respostas) ? row.respostas : [];

    responseModules.forEach((responseModule) => {
      const normalizedModuleId =
        moduleId || String(responseModule?.modulo_id || "").trim();

      if (normalizedModuleId) {
        modulesById.set(normalizedModuleId, {
          id: normalizedModuleId,
          number: responseModule?.modulo_numero || modulePayload?.numero || null,
          title: responseModule?.modulo_titulo || modulePayload?.titulo || "",
        });
      }

      const questions = Array.isArray(responseModule?.perguntas)
        ? responseModule.perguntas
        : [];

      questions.forEach((question) => {
        const questionId = String(question?.pergunta_id || "").trim();
        const answer = String(question?.resposta || "").trim();

        if (questionId && answer) {
          answers[questionId] = answer;
        }
      });
    });
  });

  return {
    answers,
    modules: Array.from(modulesById.values()),
    submissionId,
  };
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

async function ensureResponsesTable(sql) {
  await sql`
    create table if not exists respostas_discipulado (
      id text primary key default md5(random()::text || clock_timestamp()::text),
      lider_id text not null,
      lider_nome text not null,
      ministerio text not null,
      estudo_id text not null,
      estudo_titulo text not null,
      respostas jsonb not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;

  await sql`
    alter table respostas_discipulado
      add column if not exists lider_id text,
      add column if not exists lider_nome text,
      add column if not exists nome_lider text,
      add column if not exists ministerio text,
      add column if not exists estudo_id text,
      add column if not exists estudo_titulo text,
      add column if not exists titulo_estudo text,
      add column if not exists respostas jsonb,
      add column if not exists payload jsonb default '{}'::jsonb,
      add column if not exists created_at timestamptz default now()
  `;
}

function getSaveErrorMessage(error) {
  if (error?.code === "42501") {
    return "Sem permissão no Neon para gravar ou ajustar a tabela respostas_discipulado.";
  }

  if (error?.code === "42P01") {
    return "Tabela respostas_discipulado não encontrada no Neon.";
  }

  if (error?.code === "42703") {
    return "A tabela respostas_discipulado está com colunas incompatíveis.";
  }

  return error?.message
    ? `Não foi possível salvar as respostas: ${error.message}`
    : "Não foi possível salvar as respostas.";
}
