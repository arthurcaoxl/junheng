import { useEffect, useState, type FormEvent } from "react";
import {
  addSeedWhitelistEmail,
  fetchSeedWhitelist,
  isValidSeedWhitelistEmail,
  normalizeSeedWhitelistEmail,
  removeSeedWhitelistEmail,
  type SeedWhitelistSnapshot,
} from "../../services/adminSeedWhitelist";

export default function AdminSeedWhitelist() {
  const [snapshot, setSnapshot] = useState<SeedWhitelistSnapshot | null>(null);
  const [email, setEmail] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetchSeedWhitelist().then((result) => {
      if (alive) setSnapshot(result);
    }).catch((cause: unknown) => {
      if (alive) setError(cause instanceof Error ? cause.message : "白名单读取失败。");
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      setSnapshot(await fetchSeedWhitelist());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "白名单读取失败。");
    } finally {
      setLoading(false);
    }
  };

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await action();
      setSnapshot(await fetchSeedWhitelist());
      setNotice(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "白名单操作失败。");
    } finally {
      setBusy(false);
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!snapshot) return;
    const normalized = normalizeSeedWhitelistEmail(email);
    if (!isValidSeedWhitelistEmail(normalized)) {
      setError("请输入有效邮箱。");
      setNotice("");
      return;
    }
    void run(async () => {
      const result = await addSeedWhitelistEmail(normalized, snapshot);
      setEmail("");
      if (!result.changed && result.reason === "ALREADY_EXISTS") {
        return "该邮箱已在白名单中，无需重复添加。";
      }
      return "邮箱已添加到种子用户白名单。";
    });
  };

  const remove = () => {
    if (!snapshot || !pendingRemove) return;
    const target = pendingRemove;
    void run(async () => {
      const result = await removeSeedWhitelistEmail(target, snapshot);
      setPendingRemove(null);
      if (!result.changed && result.reason === "NOT_FOUND") return "该邮箱不在白名单中。";
      if (!result.changed && result.reason === "CONFIG_MISSING") return "白名单配置尚未创建。";
      return "邮箱已从种子用户白名单移除。";
    });
  };

  return (
    <section className="admin-block admin-seed-whitelist" aria-labelledby="admin-seed-whitelist-title">
      <div className="admin-block-heading">
        <h2 id="admin-seed-whitelist-title">种子用户白名单</h2>
        <span>服务端鉴权 · 乐观版本 · 全量审计</span>
      </div>
      <p className="admin-intro">邮箱保存前统一去除首尾空格并转为小写。每次变更都会携带当前配置版本，避免覆盖其他管理员的更新。</p>

      <form className="admin-seed-whitelist-add" onSubmit={add} noValidate>
        <label htmlFor="seed-whitelist-email">白名单邮箱</label>
        <input
          id="seed-whitelist-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={busy || loading || !snapshot}
          required
        />
        <button type="submit" className="admin-primary" disabled={busy || loading || !snapshot}>
          {busy ? "添加中…" : "添加邮箱"}
        </button>
      </form>

      <div className="admin-seed-whitelist-version">
        <span>{snapshot?.configExists ? `配置版本：${snapshot.updatedAt}` : "配置尚未创建"}</span>
        <button type="button" className="admin-secondary" onClick={() => void refresh()} disabled={busy || loading}>
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {loading && <p role="status">白名单加载中…</p>}
      {!loading && snapshot?.emails.length === 0 && <p className="admin-empty">尚未添加白名单邮箱。</p>}
      <ul className="admin-seed-whitelist-list" aria-label="种子用户白名单邮箱列表">
        {snapshot?.emails.map((item) => (
          <li key={item}>
            <span>{item}</span>
            <button
              type="button"
              className="admin-secondary"
              aria-label={`移除 ${item}`}
              disabled={busy || loading}
              onClick={() => { setPendingRemove(item); setError(""); setNotice(""); }}
            >
              移除
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      {pendingRemove && (
        <div className="admin-seed-whitelist-confirm" role="dialog" aria-modal="true" aria-labelledby="seed-remove-title">
          <h3 id="seed-remove-title">确认移除白名单邮箱</h3>
          <p>移除后，{pendingRemove} 将不再通过种子用户白名单获得访问资格。</p>
          <div>
            <button type="button" className="admin-secondary" disabled={busy} onClick={() => setPendingRemove(null)}>取消</button>
            <button type="button" className="admin-primary" disabled={busy} onClick={remove}>
              {busy ? "移除中…" : "确认移除"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
