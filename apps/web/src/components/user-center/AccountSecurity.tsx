import { useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { openSyncModal } from "../../services/syncUi";

export function AccountSecurity({ configured, email }: { configured: boolean; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!configured) return null;

  const changeEmail = () => {
    setError("");
    setNotice("");
    openSyncModal("change-email", {
      onSuccess: () => setNotice("邮箱修改成功，云端数据已同步"),
    });
  };

  const signOut = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: signOutError } = await getSupabase().auth.signOut();
      if (signOutError) throw signOutError;
      window.dispatchEvent(new CustomEvent("junheng-sync-changed", { detail: { email: null } }));
      setNotice("已退出登录，本机记录与云端数据均已保留。");
    } catch {
      setError("退出登录失败，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-security" aria-labelledby="account-security-title">
      <div>
        <span>ACCOUNT SECURITY</span>
        <h2 id="account-security-title">账号安全</h2>
        <p>修改邮箱不会改变账号身份或营员代码；退出登录不会删除本机与云端记录。</p>
      </div>
      {email && (
        <div className="account-security-actions">
          <button type="button" onClick={changeEmail}>修改邮箱</button>
          <button type="button" disabled={busy} onClick={signOut}>{busy ? "正在退出…" : "退出登录"}</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
