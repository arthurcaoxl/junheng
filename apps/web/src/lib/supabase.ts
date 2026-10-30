import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    throw new Error("云端同步未配置（缺少 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）");
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, flowType: "pkce" },
  });
  return client;
}

/** 匿名起步：有 session 复用，没有则静默匿名登录。 */
export async function ensureSession(): Promise<Session> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.session) throw error ?? new Error("匿名登录失败");
  return anon.session;
}
