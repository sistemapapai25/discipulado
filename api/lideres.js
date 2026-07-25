import { createClient } from "@supabase/supabase-js";

const LEADER_ROLES = ["leader", "coordinator"];

const DEFAULT_SELECT = `
  id,
  role,
  user_account!inner (
    id,
    full_name,
    first_name,
    last_name,
    nickname,
    is_active
  ),
  ministry!inner (
    id,
    name,
    is_active
  )
`;

const FK_HINT_SELECT = `
  id,
  role,
  user_account!ministry_member_user_id_fkey!inner (
    id,
    full_name,
    first_name,
    last_name,
    nickname,
    is_active
  ),
  ministry!ministry_member_ministry_id_fkey!inner (
    id,
    name,
    is_active
  )
`;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error:
        "Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente da Vercel.",
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await fetchLeaderRows(supabase, DEFAULT_SELECT);
    const rows = error
      ? await fetchLeaderRowsWithFkHint(supabase, error)
      : data || [];

    const leaders = rows.map(normalizeLeader).filter(Boolean).sort(sortLeaders);

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ leaders });
  } catch (error) {
    console.error("Erro ao carregar líderes do church360", error);
    return res.status(500).json({
      error: error.message || "Não foi possível carregar os líderes.",
    });
  }
}

async function fetchLeaderRows(supabase, selectExpression) {
  return supabase
    .from("ministry_member")
    .select(selectExpression)
    .in("role", LEADER_ROLES)
    .eq("user_account.is_active", true)
    .eq("ministry.is_active", true);
}

async function fetchLeaderRowsWithFkHint(supabase, originalError) {
  const { data, error } = await fetchLeaderRows(supabase, FK_HINT_SELECT);

  if (error) {
    throw originalError;
  }

  return data || [];
}

function normalizeLeader(row) {
  const person = row.user_account;
  const ministry = row.ministry;

  if (!row.id || !person?.id || !ministry?.id) {
    return null;
  }

  const name =
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.nickname ||
    "Líder sem nome";
  const ministryName = ministry.name || "Ministério não informado";

  return {
    id: String(row.id),
    userId: String(person.id),
    ministryId: String(ministry.id),
    name,
    ministry: ministryName,
    role: row.role || "",
    label: `${name} - ${ministryName}`,
  };
}

function sortLeaders(firstLeader, secondLeader) {
  return firstLeader.label.localeCompare(secondLeader.label, "pt-BR", {
    sensitivity: "base",
  });
}
