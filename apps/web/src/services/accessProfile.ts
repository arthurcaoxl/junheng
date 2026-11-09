import { getSupabase } from "../lib/supabase";

export type AccessProfile = {
  role: "admin" | "coach" | "staff";
  canViewRadar: boolean;
  canManageInventory: boolean;
};

export async function fetchMyAccessProfile(): Promise<AccessProfile> {
  const { data, error } = await getSupabase().rpc("get_my_access_profile");
  if (error) throw new Error("账号权限读取失败。");
  const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
  if (
    !row
    || (row.role !== "admin" && row.role !== "coach" && row.role !== "staff")
    || typeof row.can_view_radar !== "boolean"
    || typeof row.can_manage_inventory !== "boolean"
  ) throw new Error("当前账号没有有效业务角色。");
  return {
    role: row.role,
    canViewRadar: row.can_view_radar,
    canManageInventory: row.can_manage_inventory,
  };
}
