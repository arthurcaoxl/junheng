import { useEffect, useState } from "react";
import { confirmEmailUpgrade, upgradeToPermanentAccount } from "../services/authUpgrade";
import { loginWithEmail, resendRemainingSeconds, sendLoginCode, syncToCloud } from "../services/checkinSync";
import { OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";
import type { SyncMode } from "../services/syncUi";

/** 全站统一的绑定/恢复弹窗：Header 胶囊、内嵌引导、Toast、底部状态栏共用。 */
export function SyncModal({ open, mode, onClose }: { open: boolean; mode: SyncMode; onClose: () => void }) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (open) {
      setPhase("email");
      setCode("");
      setError("");
      setNotice("");
      setCooldown(0);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!open) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    if (mode === "bind") await upgradeToPermanentAccount(email);
    else await sendLoginCode(email);
    setPhase("code");
    setNotice("验证码已发送，请查收邮件（含垃圾邮件）。");
    setCooldown(resendRemainingSeconds(email) || 60);
  });

  const submitCode = () => run(async () => {
    if (mode === "bind") {
      await confirmEmailUpgrade(email, code);
      // 绑定前已有的记录也要立即上传；此前只有再次修改打卡才会触发备份。
      await syncToCloud();
      window.dispatchEvent(new CustomEvent("junheng-sync-changed", { detail: { email } }));
      onClose();
      return;
    }
    const source = await loginWithEmail(email, code);
    if (source === "local-seeded") {
      window.dispatchEvent(new CustomEvent("junheng-sync-changed", { detail: { email } }));
      setNotice("云端暂无记录，已将本机数据上传到云端。");
      setPhase("email");
      setCode("");
    } else {
      setNotice("数据已恢复，正在刷新…");
      window.location.reload();
    }
  });

  return (
    <div className="sync-modal-overlay" onClick={onClose}>
      <div
        className="sync-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="sync-modal-close" aria-label="关闭" onClick={onClose}>×</button>
        <h2 id="sync-modal-title">{mode === "bind" ? "绑定邮箱，换手机/电脑接着打卡" : "在新设备恢复数据"}</h2>
        <p className="sync-modal-sub">
          {mode === "bind"
            ? "输入邮箱接收 6–8 位数字验证码。绑定后，您的打卡记录会自动备份到云端，换手机或电脑登录即可恢复。"
            : "输入已绑定的邮箱接收验证码。登录后，云端记录会恢复到本机；本机原记录会自动备份。"}
        </p>

        {phase === "email" ? (
          <>
            <label htmlFor="sync-modal-email">邮箱地址</label>
            <input
              id="sync-modal-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
            <button type="button" className="sync-modal-primary" disabled={busy || cooldown > 0 || !email.includes("@")} onClick={sendCode}>
              {busy ? "发送中…" : cooldown > 0 ? `重发（${cooldown}s）` : mode === "bind" ? "获取邮箱验证码" : "发送登录验证码"}
            </button>
          </>
        ) : (
          <>
            <label htmlFor="sync-modal-code">邮箱验证码</label>
            <input
              id="sync-modal-code"
              {...OTP_INPUT_PROPS}
              placeholder="6–8 位数字"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoFocus
            />
            <p className="sync-modal-hint">{OTP_INPUT_HINT}</p>
            <button type="button" className="sync-modal-primary" disabled={busy || !code.trim()} onClick={submitCode}>
              {busy ? "验证中…" : mode === "bind" ? "完成绑定" : "登录并恢复数据"}
            </button>
          </>
        )}

        {error && <p className="sync-modal-error" role="alert">{error}</p>}
        {notice && <p className="sync-modal-notice" role="status">{notice}</p>}
      </div>
    </div>
  );
}
