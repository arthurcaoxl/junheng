import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";

export type SyncStatus = {
  configured: boolean; // env 是否配置；未配置时所有同步 UI 隐藏
  email: string | null; // session.user.email：有值 = 已绑定永久账户
  ready: boolean; // 首次 session 读取完成
};

/** 全站共享的同步状态。getSession 读本地持久化 session，常规路径无网络请求。 */
export function useSyncStatus(): SyncStatus {
  const [configured] = useState(() => {
    try {
      getSupabase();
      return true;
    } catch {
      return false;
    }
  });
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) return;
    const client = getSupabase();
    let alive = true;
    const apply = (sessionEmail: string | null | undefined) => {
      if (!alive) return;
      setEmail(sessionEmail ?? null);
      setReady(true);
    };
    client.auth.getSession()
      .then(({ data }) => apply(data.session?.user.email))
      .catch(() => apply(null));
    // 登录/绑定/登出后状态自动刷新（mock 环境无此方法时跳过）
    const subscription = client.auth.onAuthStateChange?.((_event: string, session: { user?: { email?: string | null } } | null) => {
      apply(session?.user?.email);
    })?.data?.subscription;
    // 统一弹窗完成绑定/种子恢复后主动广播，确保 Header、表单与底部状态栏同步更新。
    const onSyncChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ email?: string | null }>).detail;
      apply(detail?.email);
    };
    window.addEventListener("junheng-sync-changed", onSyncChanged);
    return () => {
      alive = false;
      subscription?.unsubscribe();
      window.removeEventListener("junheng-sync-changed", onSyncChanged);
    };
  }, [configured]);

  return { configured, email, ready };
}
