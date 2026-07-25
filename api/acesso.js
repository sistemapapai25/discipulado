import { createClient } from "@supabase/supabase-js";

const DEFAULT_DEPARTMENT_SELECT = `
  id,
  role,
  ministry!inner (
    id,
    name,
    is_active
  )
`;

const FK_HINT_DEPARTMENT_SELECT = `
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

    const departments = await findDepartmentsByUserId(supabase, person.id);
    const ministries = departments
      .map((department) => normalizeDepartment(person, department))
      .filter(Boolean)
      .sort(sortDepartments);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      leader: {
        id: String(person.id),
        email: person.email || email,
        name: getPersonName(person),
        photoUrl: getPersonPhotoUrl(person),
      },
      ministries,
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
      "id,email,full_name,first_name,last_name,nickname,is_active,role_global,status,member_type,avatar_url,photo_url,foto",
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

async function findDepartmentsByUserId(supabase, userId) {
  const { data, error } = await fetchDepartmentRows(
    supabase,
    userId,
    DEFAULT_DEPARTMENT_SELECT,
  );

  if (!error) {
    return data || [];
  }

  const fallback = await fetchDepartmentRows(
    supabase,
    userId,
    FK_HINT_DEPARTMENT_SELECT,
  );

  if (!fallback.error) {
    return fallback.data || [];
  }

  console.warn("Não foi possível carregar departamentos do usuário", {
    error: error.message,
    fallbackError: fallback.error.message,
  });

  return [];
}

async function fetchDepartmentRows(supabase, userId, selectExpression) {
  return supabase
    .from("ministry_member")
    .select(selectExpression)
    .eq("user_id", userId)
    .eq("ministry.is_active", true);
}

function normalizeDepartment(person, department) {
  const ministry = department.ministry;

  if (!department.id || !person?.id || !ministry?.id) {
    return null;
  }

  const userName = getPersonName(person);
  const ministryName = ministry.name || "Departamento não informado";

  return {
    id: String(department.id),
    userId: String(person.id),
    ministryId: String(ministry.id),
    name: userName,
    ministry: ministryName,
    role: department.role || "",
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

function getPersonPhotoUrl(person) {
  return [person.photo_url, person.avatar_url, person.foto]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "";
}

function sortDepartments(firstDepartment, secondDepartment) {
  const firstLabel = firstDepartment.label || firstDepartment.ministry || "";
  const secondLabel = secondDepartment.label || secondDepartment.ministry || "";

  return firstLabel.localeCompare(secondLabel, "pt-BR", {
    sensitivity: "base",
  });
}

function normalizeEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    ? normalizedEmail
    : "";
}
