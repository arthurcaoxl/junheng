import { useEffect, useState, type FormEvent } from "react";
import CoachDashboardPanels from "../components/coach/CoachDashboardPanels";
import type { AccessProfile } from "../services/accessProfile";
import { getSupabase } from "../lib/supabase";
import { sendLoginCode } from "../services/checkinSync";
import { isValidOtpCode, normalizeOtpInput, OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";

export default function CoachDashboardPage() {
  const [phase, setPhase] = useState<"checking" | "email" | "code" | "ready">("checking");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessRole, setAccessRole] = useState<AccessProfile["role"] | null>(null);

  useEffect(() => {
    let alive = true;
    getSupabase().auth.getSession().then(({ data }) => {
      if (alive) setPhase(data.session?.user.email ? "ready" : "email");
    }).catch(() => { if (alive) setPhase("email"); });
    return () => { alive = false; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (phase === "email") {
        await sendLoginCode(email);
        setPhase("code");
      } else {
        const token = normalizeOtpInput(code);
        const { error: verifyError } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
        if (verifyError) throw new Error("验证码不正确或已过期，请重新获取。");
        setPhase("ready");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "ready") {
    return (
      <div className="admin-page coach-dashboard-page">
        <section className="admin-shell" aria-labelledby="coach-dashboard-title">
          <p className="admin-eyebrow">{accessRole === "staff" ? "STAFF · SERVICE" : "COACH · OPERATIONS"}</p>
          <h1 id="coach-dashboard-title">{accessRole === "staff" ? "员工服务看板" : "教练经营看板"}</h1>
          <p className="admin-intro">{accessRole === "staff"
            ? "仅查看当前分配教练名下的脱敏体验官灯号与服务提醒。"
            : "查看本人名下脱敏营员灯号、云仓库存与季度服务提醒。"}</p>
          <CoachDashboardPanels onRole={setAccessRole} />
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page coach-dashboard-page">
      <section className="admin-shell admin-login-card" aria-labelledby="coach-dashboard-login-title">
        <p className="admin-eyebrow">COACH · OPERATIONS</p>
        <h1 id="coach-dashboard-login-title">教练登录</h1>
        <p className="admin-intro">使用教练邮箱验证码登录经营看板。教练身份不能进入管理后台。</p>
        {phase === "checking" ? <p role="status">登录状态检查中…</p> : (
          <form onSubmit={submit}>
            <label htmlFor="coach-dashboard-email">教练邮箱</label>
            <input id="coach-dashboard-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            {phase === "code" && (
              <>
                <label htmlFor="coach-dashboard-otp">邮箱验证码</label>
                <input id="coach-dashboard-otp" {...OTP_INPUT_PROPS} value={code} onChange={(event) => setCode(event.target.value)} required />
                <p className="admin-hint">{OTP_INPUT_HINT}</p>
              </>
            )}
            <button type="submit" className="admin-primary" disabled={busy || (phase === "code" && !isValidOtpCode(code))}>
              {phase === "email" ? "获取教练验证码" : "登录经营看板"}
            </button>
          </form>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
