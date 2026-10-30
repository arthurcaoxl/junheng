import { useEffect, useState } from "react";
import { getSupabase } from "../lib/supabase";
import { confirmEmailUpgrade, upgradeToPermanentAccount } from "../services/authUpgrade";
import { loginWithEmail, resendRemainingSeconds, sendLoginCode } from "../services/checkinSync";
import { OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";

type Mode = "none" | "bind" | "restore";
type Phase = "email" | "code";

/** 跨设备同步面板：绑定邮箱（匿名→永久）与新设备恢复（云端覆盖本地）两个入口。
 *  未配置 Supabase 环境变量时整体隐藏，站点行为与此前完全一致。 */
export function SyncPanel() {
  const [configured] = useState(() => {
    try {
      getSupabase();
      return true;
    } catch {
      return false;
    }
  });
  const [boundEmail, setBoundEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    getSupabase().auth.getSession().then(({ data }) => {
      if (alive) setBoundEmail(data.session?.user.email ?? null);
    }).catch(() => { /* 状态读取失败不阻断面板 */ });
    return () => { alive = false; };
  }, [configured]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!configured) return null;

  const resetFlow = (next: Mode) => {
    setMode(next);
    setPhase("email");
    setCode("");
    setError("");
    setNotice("");
    setCooldown(0);
  };

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
      setBoundEmail(email);
      setNotice("绑定成功！以后在其他设备用此邮箱 + 验证码即可同步。");
      setPhase("email");
      setCode("");
      setMode("none");
      return;
    }
    const source = await loginWithEmail(email, code);
    if (source === "local-seeded") {
      setNotice("云端暂无记录，已将本机数据上传到云端。");
      setPhase("email");
      setCode("");
    } else {
      setNotice("数据已恢复，正在刷新…");
      window.location.reload();
    }
  });

  return (
    <section className="sync-panel" aria-labelledby="sync-panel-title">
      <h2 id="sync-panel-title">跨设备同步</h2>
      {boundEmail ? (
        <p className="sync-panel-status">已绑定：{boundEmail}。本机记录会自动同步到云端。</p>
      ) : (
        <p className="sync-panel-status">记录目前只保存在本机。绑定邮箱后，换手机或电脑也能接着打卡。</p>
      )}

      <div className="sync-panel-actions">
        <button type="button" onClick={() => resetFlow(mode === "bind" ? "none" : "bind")} aria-expanded={mode === "bind"}>
          绑定邮箱，永久保存
        </button>
        <button type="button" onClick={() => resetFlow(mode === "restore" ? "none" : "restore")} aria-expanded={mode === "restore"}>
          在新设备恢复数据
        </button>
      </div>

      {mode !== "none" && (
        <div className="sync-panel-form">
          {phase === "email" ? (
            <>
              <label htmlFor="sync-email">邮箱地址</label>
              <input
                id="sync-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button type="button" className="sync-panel-primary" disabled={busy || cooldown > 0 || !email.includes("@")} onClick={sendCode}>
                {busy ? "发送中…" : cooldown > 0 ? `重发（${cooldown}s）` : mode === "bind" ? "发送绑定验证码" : "发送登录验证码"}
              </button>
            </>
          ) : (
            <>
              <label htmlFor="sync-code">邮箱验证码</label>
              <input
                id="sync-code"
                {...OTP_INPUT_PROPS}
                placeholder="6–8 位数字"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
              <p className="sync-panel-hint">{OTP_INPUT_HINT}</p>
              {mode === "restore" && <p className="sync-panel-hint">恢复后云端记录会覆盖本机（本机原记录会自动备份）。</p>}
              <button type="button" className="sync-panel-primary" disabled={busy || !code.trim()} onClick={submitCode}>
                {busy ? "验证中…" : mode === "bind" ? "完成绑定" : "登录并恢复数据"}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="sync-panel-error" role="alert">{error}</p>}
      {notice && <p className="sync-panel-notice" role="status">{notice}</p>}
    </section>
  );
}
