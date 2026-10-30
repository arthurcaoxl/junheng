import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../lib/supabase";
import {
  buildAdminCsv,
  buildCampDayMetrics,
  fetchAdminCheckIns,
  logoutAdmin,
  sendAdminLoginCode,
  verifyAdminLogin,
  type AdminCamper,
} from "../services/adminCheckin";
import { resendRemainingSeconds } from "../services/checkinSync";
import { OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default function AdminCheckInPage() {
  const [configured] = useState(() => {
    try {
      getSupabase();
      return true;
    } catch {
      return false;
    }
  });
  const [phase, setPhase] = useState<"email" | "code" | "ready">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [loggedEmail, setLoggedEmail] = useState("");
  const [campers, setCampers] = useState<AdminCamper[]>([]);
  const campMetrics = useMemo(() => buildCampDayMetrics(campers), [campers]);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    getSupabase().auth.getSession()
      .then(async ({ data }) => {
        const sessionEmail = data.session?.user.email;
        if (!sessionEmail) return;
        const rows = await fetchAdminCheckIns();
        if (!alive) return;
        setCampers(rows);
        setLoggedEmail(sessionEmail);
        setPhase("ready");
      })
      .catch(() => { /* 非管理员或未登录时停留在验证码登录 */ });
    return () => { alive = false; };
  }, [configured]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (!configured) {
    return (
      <div className="admin-page">
        <section className="admin-shell">
          <h1>打卡统计管理</h1>
          <p className="admin-error" role="alert">云端同步未配置，请先在 Supabase 项目中配置 anon key。</p>
        </section>
      </div>
    );
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    await sendAdminLoginCode(email);
    setPhase("code");
    setNotice("验证码已发送，请查收邮件（含垃圾邮件）。");
    setCooldown(resendRemainingSeconds(email) || 60);
  });

  const submitCode = () => run(async () => {
    const rows = await verifyAdminLogin(email, code);
    setCampers(rows);
    setLoggedEmail(email);
    setPhase("ready");
    setNotice(rows.length ? "统计数据已更新。" : "管理员验证成功，目前还没有已备份的营员记录。");
  });

  const exportCsv = () => {
    const blob = new Blob([buildAdminCsv(campers)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `菌衡计划-打卡统计-脱敏-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const signOut = () => run(async () => {
    await logoutAdmin();
    setCampers([]);
    setLoggedEmail("");
    setCode("");
    setPhase("email");
    setNotice("已退出管理员登录。");
  });

  if (phase !== "ready") {
    return (
      <div className="admin-page">
        <section className="admin-shell admin-login-card" aria-labelledby="admin-login-title">
          <p className="admin-eyebrow">ADMIN · CHECK-IN ANALYTICS</p>
          <h1 id="admin-login-title">打卡统计管理</h1>
          <p className="admin-intro">管理员邮箱验证后，可查看已备份营员趋势。普通用户无法访问他人数据。</p>

          <label htmlFor="admin-email">管理员邮箱</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
          />
          {phase === "code" && (
            <>
              <label htmlFor="admin-code">邮箱验证码</label>
              <input
                id="admin-code"
                {...OTP_INPUT_PROPS}
                placeholder="6–8 位数字"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoFocus
              />
              <p className="admin-hint">{OTP_INPUT_HINT}</p>
            </>
          )}

          {phase === "email" ? (
            <button type="button" className="admin-primary" disabled={busy || cooldown > 0 || !email.includes("@")} onClick={sendCode}>
              {busy ? "发送中…" : cooldown > 0 ? `重发（${cooldown}s）` : "获取管理员验证码"}
            </button>
          ) : (
            <button type="button" className="admin-primary" disabled={busy || !code.trim()} onClick={submitCode}>
              {busy ? "验证中…" : "登录并查看统计"}
            </button>
          )}

          {error && <p className="admin-error" role="alert">{error}</p>}
          {notice && <p className="admin-notice" role="status">{notice}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <section className="admin-shell" aria-labelledby="admin-title">
        <div className="admin-heading">
          <div>
            <p className="admin-eyebrow">ADMIN · CHECK-IN ANALYTICS</p>
            <h1 id="admin-title">打卡统计管理</h1>
            <p className="admin-intro">仅展示已备份到云端的记录；UID 不出现在页面和导出文件中。</p>
          </div>
          <div className="admin-heading-actions">
            <span className="admin-email-pill">{loggedEmail}</span>
            <button type="button" className="admin-secondary" onClick={exportCsv} disabled={!campers.length}>导出脱敏 CSV</button>
            <button type="button" className="admin-secondary" onClick={signOut} disabled={busy}>退出登录</button>
          </div>
        </div>

        <section className="admin-block" aria-labelledby="admin-campers-title">
          <div className="admin-block-heading">
            <h2 id="admin-campers-title">已备份营员</h2>
            <span>{campers.length} 人</span>
          </div>
          {campers.length ? (
            <div className="admin-table-wrap" tabIndex={0} aria-label="营员列表，可横向滚动">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>营员代码</th>
                    <th>邮箱</th>
                    <th>开营日期</th>
                    <th>累计打卡</th>
                    <th>最近备份</th>
                  </tr>
                </thead>
                <tbody>
                  {campers.map((camper) => (
                    <tr key={camper.authUserId}>
                      <td>{camper.userCode}</td>
                      <td>{camper.email}</td>
                      <td>{camper.startDate}</td>
                      <td>{camper.recordedDays} 天</td>
                      <td>{formatDateTime(camper.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="admin-empty">暂无已备份记录。</p>}
        </section>

        <section className="admin-block" aria-labelledby="admin-trend-title">
          <div className="admin-block-heading">
            <h2 id="admin-trend-title">D1–D21 对齐趋势</h2>
            <span>体重/腰围为相对各自首条记录的均值</span>
          </div>
          <div className="admin-table-wrap" tabIndex={0} aria-label="D1 至 D21 趋势表，可横向滚动">
            <table className="admin-table admin-trend-table">
              <thead>
                <tr>
                  <th>营期日</th>
                  <th>人数</th>
                  <th>体重变化</th>
                  <th>腰围变化</th>
                  <th>三餐前饮用</th>
                  <th>饮水</th>
                  <th>运动</th>
                  <th>作息</th>
                </tr>
              </thead>
              <tbody>
                {campMetrics.map((metric) => (
                  <tr key={metric.dayIndex}>
                    <td>D{metric.dayIndex}</td>
                    <td>{metric.participants || "—"}</td>
                    <td>{percent(metric.avgWeightChangePercent)}</td>
                    <td>{percent(metric.avgWaistChangePercent)}</td>
                    <td>
                      <span className="admin-trend-track" aria-hidden="true"><span style={{ width: `${metric.mealCompletionRate ?? 0}%` }} /></span>
                      {percent(metric.mealCompletionRate)}
                    </td>
                    <td>{percent(metric.waterRate)}</td>
                    <td>{percent(metric.movementRate)}</td>
                    <td>{percent(metric.sleepRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {error && <p className="admin-error" role="alert">{error}</p>}
        {notice && <p className="admin-notice" role="status">{notice}</p>}
      </section>
    </div>
  );
}
