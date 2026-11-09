import { getSupabase } from "../lib/supabase";

export type AdminCoachDirectoryEntry = {
  coachId: string;
  email: string;
  name: string | null;
  phone: string | null;
};

export async function fetchAdminCoachDirectory(query: string): Promise<AdminCoachDirectoryEntry[]> {
  const p_query = query.trim();
  if (p_query.length < 2) return [];
  const { data, error } = await getSupabase().rpc("admin_get_coach_directory", { p_query });
  if (error) throw new Error("教练邮箱搜索失败，请稍后重试。");
  if (!Array.isArray(data)) throw new Error("教练目录返回格式异常。");
  return data.flatMap((raw) => {
    const row = raw as Record<string, unknown>;
    return typeof row.coach_id === "string" && typeof row.email === "string"
      ? [{
        coachId: row.coach_id,
        email: row.email,
        name: typeof row.name === "string" && row.name.trim() ? row.name : null,
        phone: typeof row.phone === "string" && row.phone.trim() ? row.phone : null,
      }]
      : [];
  });
}
