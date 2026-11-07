import { useEffect, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { fetchCloudConsent, saveCloudConsent } from "../../services/consent";
import { openSyncModal } from "../../services/syncUi";
import { ConsentDialog } from "../ConsentDialog";

export function AccountSecurity({ configured, email }: { configured: boolean; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // 数据授权三态：true=已授权 / false=明确拒绝或建档默认未授权 / null=从未表态。
  // 后两种统一按“未参与”展示（避免区分来源带来的逻辑复杂化），均可一键“同意参与”。
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentReady, setConsentReady] = useState(false);
  const [agreePrompt, setAgreePrompt] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    fetchCloudConsent().then((value) => {
      if (!alive) return;
      setConsent(value);
      setConsentReady(true);
    });
    return () => {
      alive = false;
    };
  }, [configured]);

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

  /** 撤回授权：合规要求用户可随时撤回，写回云端并同步翻转界面。 */
  const withdrawConsent = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveCloudConsent(false).catch((syncError: unknown) => {
        console.warn("撤回授权云端同步失败，已保留本机记录。", syncError);
      });
      setConsent(false);
      setNotice("已撤回数据研究授权，可随时重新同意。");
    } finally {
      setBusy(false);
    }
  };

  /** 重新同意：复用总授权弹窗走“勾选确认”的完整交互。 */
  const agreeFromDialog = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveCloudConsent(true).catch((syncError: unknown) => {
        console.warn("授权云端同步失败，已保留本机记录。", syncError);
      });
      setConsent(true);
      setAgreePrompt(false);
      setNotice("已同意参与数据研究，感谢您的信任。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="account-security" aria-labelledby="account-security-title">
      <div>
        <span>ACCOUNT SECURITY</span>
        <h2 id="account-security-title">账号安全</h2>
        <p>修改邮箱不会改变账号身份或体验官代码；退出登录不会删除本机与云端记录。</p>
      </div>
      <div className="account-consent">
        <div>
          <strong>数据授权</strong>
          <p>
            {!consentReady
              ? "正在读取授权状态…"
              : consent === true
                ? "已授权参与数据研究"
                : "当前未参与数据研究"}
          </p>
        </div>
        {consentReady && (consent === true ? (
          <p className="account-consent-notice" style={{ fontSize: '11px', opacity: 0.6 }}>
            如需撤回数据授权，请联系平台客服处理。
          </p>
        ) : (
          <button type="button" className="account-consent-agree" onClick={() => setAgreePrompt(true)}>
            同意参与
          </button>
        ))}
      </div>
      {email && (
        <div className="account-security-actions">
          <button type="button" onClick={changeEmail}>修改邮箱</button>
          <button type="button" disabled={busy} onClick={signOut}>{busy ? "正在退出…" : "退出登录"}</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {agreePrompt && (
        <ConsentDialog
          busy={busy}
          onAgree={() => void agreeFromDialog()}
          onDecline={() => setAgreePrompt(false)}
        />
      )}
    </section>
  );
}
