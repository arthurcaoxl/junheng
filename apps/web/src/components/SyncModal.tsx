import { useEffect, useState } from "react";
import { confirmEmailUpgrade, upgradeToPermanentAccount } from "../services/authUpgrade";
import { loginWithEmail, resendRemainingSeconds, sendLoginCode, syncToCloud } from "../services/checkinSync";
import { OTP_INPUT_HINT, OTP_INPUT_PROPS } from "../services/otp";
import type { SyncMilestoneKind, SyncMode } from "../services/syncUi";

type SyncModalProps = {
  open: boolean;
  mode: SyncMode;
  onClose: () => void;
  onSuccess?: () => void;
  milestone?: boolean;
  milestoneKind?: SyncMilestoneKind;
  posterUrl?: string;
  preserveFocus?: boolean;
};

/** 全站统一的绑定/恢复弹窗：普通入口与 D7 里程碑拦截共用同一套 OTP 逻辑。 */
export function SyncModal({ open, mode, onClose, onSuccess, milestone = false, milestoneKind = "trend", posterUrl = "", preserveFocus = false }: SyncModalProps) {
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
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !milestone) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, milestone, onClose]);

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
    if (mode === "bind" || mode === "change-email") await upgradeToPermanentAccount(email);
    else await sendLoginCode(email);
    setPhase("code");
    setNotice("验证码已发送，请查收邮件（含垃圾邮件）。");
    setCooldown(resendRemainingSeconds(email) || 60);
  });

  // 原地升级保留 auth.uid；只有服务端邮箱真正更新、且云端同步完成后才广播成功。
  const finishEmailChange = async () => {
    const syncResult = await syncToCloud();
    if (mode === "change-email" && syncResult !== "synced") {
      throw new Error("邮箱已验证，但云端数据同步未完成，请检查网络后重试。");
    }
    window.dispatchEvent(new CustomEvent("junheng-sync-changed", { detail: { email } }));
    onSuccess?.();
    onClose();
  };

  const submitCode = () => run(async () => {
    if (mode === "bind" || mode === "change-email") {
      // confirmEmailUpgrade 内部已强制核对服务端真实邮箱，未生效会直接抛错
      await confirmEmailUpgrade(email, code);
      await finishEmailChange();
      return;
    }
    const source = await loginWithEmail(email, code);
    if (source === "cloud-restored") {
      setNotice("数据已恢复，正在刷新…");
      window.location.reload();
      return;
    }
    window.dispatchEvent(new CustomEvent("junheng-sync-changed", { detail: { email } }));
    setNotice(
      source === "local-seeded" ? "云端暂无记录，已将本机数据上传到云端。"
        : source === "local-merged" ? "本机与云端记录已按日期合并，本机新增记录已补传到云端。"
          : source === "empty" ? "当前暂无打卡记录，账号同步已就绪。"
            : "当前账号的数据已完成同步。",
    );
    setPhase("email");
    setCode("");
  });

  return (
    <div className="sync-modal-overlay" onClick={milestone ? undefined : onClose}>
      <div
        className={`sync-modal${milestone ? " sync-modal-milestone" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        {!milestone && <button type="button" className="sync-modal-close" aria-label="关闭" onClick={onClose}>×</button>}
        {milestone && posterUrl && (
          <div className="sync-modal-milestone-visual">
            <img src={posterUrl} alt={milestoneKind === "poster" ? "专属健康海报模糊预览" : milestoneKind === "certificate" ? "会员结业纪念证书模糊预览" : "7 天健康趋势海报预览"} />
          </div>
        )}
        <h2 id="sync-modal-title">
          {milestone
            ? milestoneKind === "poster" ? "🎉 您的专属健康海报已生成！" : milestoneKind === "certificate" ? "🎉 您的会员结业纪念证书已生成！" : "🎉 太棒了！您已坚持记录 7 天，专属的健康趋势已经生成！"
            : mode === "bind" ? "绑定邮箱，换手机/电脑接着打卡" : mode === "change-email" ? "修改登录邮箱" : "恢复您的脂代谢档案"}
        </h2>
        <p className="sync-modal-sub">
          {milestone
            ? milestoneKind === "poster"
              ? "绑定邮箱即可永久保存这份成就（换手机不丢失）。登录后将自动为您展开高清海报。"
              : milestoneKind === "certificate"
                ? "绑定邮箱即可永久保存这份会员成长纪念（换手机不丢失）。登录后将自动为您展开证书。"
                : "为了防止数据丢失（换手机/清缓存），请绑定邮箱永久保存。登录后自动为您展开成果。"
            : mode === "bind"
              ? "输入邮箱接收 6–8 位数字验证码。绑定后，您的打卡记录会自动备份到云端，换手机或电脑登录即可恢复。"
              : mode === "change-email"
                ? "输入新邮箱接收验证码。验证与云端同步成功后才会更新登录邮箱，账号身份和营员代码保持不变。"
                : "输入已绑定的邮箱接收验证码。登录后，云端记录会恢复到本机；本机原记录会自动备份。"}
        </p>
        {!milestone && mode === "restore" && (
          <p className="sync-modal-restore-warning">⚠️ 请勿使用新邮箱登录，否则将无法找回您的历史打卡记录。</p>
        )}

        {phase === "email" ? (
          <>
            <label htmlFor="sync-modal-email">邮箱地址</label>
            <input
              id="sync-modal-email"
              type="email"
              autoComplete="email"
              placeholder={!milestone && mode === "restore" ? "请输入您之前绑定的原邮箱" : "you@example.com"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus={!preserveFocus}
            />
            <button type="button" className="sync-modal-primary" disabled={busy || cooldown > 0 || !email.includes("@")} onClick={sendCode}>
              {busy ? "发送中…" : cooldown > 0 ? `重发（${cooldown}s）` : milestone && milestoneKind === "poster" ? "立即绑定并查看海报" : milestone && milestoneKind === "certificate" ? "立即绑定并查看证书" : mode === "bind" ? "获取邮箱验证码" : mode === "change-email" ? "发送修改验证码" : "发送登录验证码"}
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
              {busy ? "验证中…" : milestone && milestoneKind === "poster" ? "完成绑定并查看海报" : milestone && milestoneKind === "certificate" ? "完成绑定并查看证书" : mode === "bind" ? "完成绑定" : mode === "change-email" ? "确认修改邮箱" : "登录并恢复数据"}
            </button>
          </>
        )}

        {error && <p className="sync-modal-error" role="alert">{error}</p>}
        {notice && <p className="sync-modal-notice" role="status">{notice}</p>}
        {milestone && <button type="button" className="sync-modal-secondary" onClick={onClose}>暂不，返回打卡</button>}
      </div>
    </div>
  );
}
