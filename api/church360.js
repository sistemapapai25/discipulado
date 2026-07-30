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

export function isChurch360Configured() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

export function hasServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createChurch360Client() {
  return createClient(getSupabaseUrl(), getSupabaseKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * O church360 é a fonte da verdade de quem é membro ativo. Só leitura: senha e
 * código ficam no Neon, para não escrever nada no Supabase da igreja.
 */
export async function findActivePersonByEmail(supabase, email) {
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

/**
 * Busca membros ativos por nome ou e-mail, para a tela de senhas do
 * administrador. Sem termo, devolve os primeiros em ordem alfabetica.
 */
export async function searchActivePeople(supabase, term, limit = 25) {
  const cleanTerm = String(term || "").trim();
  let query = supabase
    .from("user_account")
    .select("id,email,full_name,first_name,last_name,nickname")
    .eq("is_active", true);

  if (cleanTerm) {
    const pattern = `%${cleanTerm.replace(/[%_]/g, "")}%`;
    query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  }

  const { data, error } = await query.order("full_name").limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).filter((person) => person.email);
}

export async function findDepartmentsByUserId(supabase, userId) {
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

export function buildLeaderResponse(person, departments, fallbackEmail) {
  const ministries = departments
    .map((department) => normalizeDepartment(person, department))
    .filter(Boolean)
    .sort(sortDepartments);

  return {
    leader: {
      id: String(person.id),
      email: person.email || fallbackEmail,
      name: getPersonName(person),
      photoUrl: getPersonPhotoUrl(person),
    },
    ministries,
  };
}

export function getPersonName(person) {
  return (
    person.full_name ||
    [person.first_name, person.last_name].filter(Boolean).join(" ") ||
    person.nickname ||
    "Usuário sem nome"
  );
}

export function getPersonFirstName(person) {
  const name = getPersonName(person);
  return name.split(/\s+/)[0] || name;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || "";
}

function getSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ""
  );
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
