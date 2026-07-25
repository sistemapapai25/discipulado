import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = supabaseServiceRoleKey || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error:
        "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.",
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
      const errorMessage = supabaseServiceRoleKey
        ? "E-mail não encontrado como usuário ativo no church360."
        : "Não foi possível ler este e-mail no church360. Configure SUPABASE_SERVICE_ROLE_KEY na Vercel para a função acessar user_account sem bloqueio de RLS.";

      return res.status(404).json({
        error: errorMessage,
      });
    }

    const personAccess = normalizeUserAccountAccess(person);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      leader: {
        id: String(person.id),
        email: person.email || email,
        name: getPersonName(person),
      },
      ministries: [personAccess],
    });
  } catch (error) {
    console.error("Erro ao validar acesso do usuário", error);
    return res.status(500).json({
      error: error.message || "Não foi possível validar seu acesso.",
    });
  }
}

async function findActivePersonByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("user_account")
    .select(
      "id,email,full_name,first_name,last_name,nickname,is_active,role_global,status,member_type",
    )
    .ilike("email", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function normalizeUserAccountAccess(person) {
  const leaderName = getPersonName(person);
  const ministryName = "Cadastro church360";

  return {
    id: `user-account:${person.id}`,
    userId: String(person.id),
    ministryId: null,
    name: leaderName,
    ministry: ministryName,
    role: person.role_global || person.member_type || person.status || "user_account",
    label: ministryName,
  };
}

function getPersonName(person) {
  return (
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.nickname ||
    "Usuário sem nome"
  );
}

function normalizeEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ? normalizedEmail
    : "";
}
