import { getSupabase } from "../lib/supabase";

export type CoachContact = {
  phone: string | null;
  wechat: string | null;
};

export async function getMyCoachContact(): Promise<CoachContact | null> {
  const { data, error } = await getSupabase().rpc("get_my_coach_contact_v1");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as CoachContact | null | undefined;
  if (!row) return null;
  return {
    phone: typeof row.phone === "string" && row.phone.trim() ? row.phone : null,
    wechat: typeof row.wechat === "string" && row.wechat.trim() ? row.wechat : null,
  };
}
