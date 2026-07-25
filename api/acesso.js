import { createClient } from "@supabase/supabase-js";

const LEADER_ROLES = ["leader", "coordinator"];

const DEFAULT_SELECT = `
  id,
  role,
  ministry!inner (
    id,
    name,
    is_active
  )
`;

const FK_HINT_SELECT = `
  id,
  role,
  ministry!ministry_member_ministry_id_fkey!inner (
    id,
    name,
    is_active
  )
`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
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
    const email = normalizeEmail(req.body?.email);

    if (!email) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const person = await findActivePersonByEmail(supabase, email);

    if (!person) {
      return res.status(404).json({
        error: "E-mail não encontrado como usuário ativo no church360.",
      });
    }

    const memberships = await findLeadershipMemberships(supabase, person.id);
    const ministries = memberships
      .map((membership) => normalizeMembership(person, membership))
      .filter(Boolean)
      .sort(sortLeaders);

    if (!ministries.length) {
      return res.status(403).json({
        error:
          "Este e-mail não possui vínculo ativo como líder ou coordenador de ministério.",
      });
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      leader: {
        id: String(person.id),
        email: person.email || email,
        name: getPersonName(person),
      },
      ministries,
    });
  } catch (error) {
    console.error("Erro ao validar acesso do líder", error);
    return res.status(500).json({
      error: error.message || "Não foi possível validar seu acesso.",
    });
  }
}

async function findActivePersonByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("user_account")
    .select("id,email,full_name,first_name,last_name,nickname,is_active")
    .ilike("email", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findLeadershipMemberships(supabase, userId) {
  const { data, error } = await fetchMembershipRows(
    supabase,
    userId,
    DEFAULT_SELECT,
  );

  if (!error) {
    return data || [];
  }

  const fallback = await fetchMembershipRows(supabase, userId, FK_HINT_SELECT);

  if (fallback.error) {
    throw error;
  }

  return fallback.data || [];
}

async function fetchMembershipRows(supabase, userId, selectExpression) {
  return supabase
    .from("ministry_member")
    .select(selectExpression)
    .eq("user_id", userId)
    .in("role", LEADER_ROLES)
    .eq("ministry.is_active", true);
}

function normalizeMembership(person, membership) {
  const ministry = membership.ministry;

  if (!membership.id || !person?.id || !ministry?.id) {
    return null;
  }

  const leaderName = getPersonName(person);
  const ministryName = ministry.name || "Ministério não informado";

  return {
    id: String(membership.id),
    userId: String(person.id),
    ministryId: String(ministry.id),
    name: leaderName,
    ministry: ministryName,
    role: membership.role || "",
    label: `${ministryName} (${formatRole(membership.role)})`,
  };
}

function getPersonName(person) {
  return (
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.nickname ||
    "Líder sem nome"
  );
}

function formatRole(role) {
  if (role === "leader") {
    return "líder";
  }

  if (role === "coordinator") {
    return "coordenador";
  }

  return "liderança";
}

function sortLeaders(firstLeader, secondLeader) {
  return firstLeader.label.localeCompare(secondLeader.label, "pt-BR", {
    sensitivity: "base",
  });
}

function normalizeEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ? normalizedEmail
    : "";
}
