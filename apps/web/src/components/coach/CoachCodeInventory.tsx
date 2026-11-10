import { useCallback, useEffect, useState } from "react";
import {
  COACH_PENDING_REVIEWS_EVENT,
  fetchMyCodeInventory,
  pushCoachCode,
  requestCoachRestock,
  type CoachCodeInventory as Inventory,
} from "../../services/codePool";
import type { CoachCamper } from "../../services/coachRadar";

type Props = {
  campers?: CoachCamper[];
  preferredCamperRef?: string;
  onPreferredCamperConsumed?: () => void;
};

export default function CoachCodeInventory({ campers = [], preferredCamperRef, onPreferredCamperConsumed }: Props) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [restockNote, setRestockNote] = useState("");
  const [restockPending, setRestockPending] = useState(false);
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshInventory = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      setInventory(await fetchMyCodeInventory());
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/[\u4e00-\u9fff]/.test(message) ? message : "产品激活码库操作失败，请稍后重试。");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  useEffect(() => {
    if (!preferredCamperRef || !inventory) return;
    const camper = campers.find((item) => item.camperRef === preferredCamperRef);
    if (!camper) return;
    setTargets((current) => {
      const next = { ...current };
      inventory.codes.forEach((item) => { next[item.codeId] = preferredCamperRef; });
      return next;
    });
    setNotice(`已为 ${camper.camperCode} 预选直推目标，请选择 RC 充值码；提交后仍需 Admin 审核。`);
  }, [campers, inventory, preferredCamperRef]);

  const copy = async (codeId: string, code: string) => {
    setError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(codeId);
    } catch {
      setError("复制失败，请手动选择码面复制。");
    }
  };

  const requestRestock = async () => {
    setBusy("restock");
    setError("");
    setNotice("");
    try {
      await requestCoachRestock(restockNote);
      setRestockPending(true);
      setNotice("补货申请已提交，等待 Admin 处理");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "补货申请失败，请稍后重试。");
    } finally {
      setBusy("");
    }
  };

  const push = async (codeId: string) => {
    const camperRef = targets[codeId];
    if (!camperRef) return;
    setBusy(codeId);
    setError("");
    setNotice("");
    try {
      if (typeof globalThis.crypto?.randomUUID !== "function") throw new Error("当前浏览器无法生成安全请求标识，请升级浏览器。");
      await pushCoachCode(camperRef, codeId, globalThis.crypto.randomUUID());
      setTargets((current) => {
        const next = { ...current };
        delete next[codeId];
        return next;
      });
      setCopiedId("");
      if (preferredCamperRef) onPreferredCamperConsumed?.();
      setNotice("已提交 Admin 审核，库存将在审核通过时扣减");
      window.dispatchEvent(new Event(COACH_PENDING_REVIEWS_EVENT));
      await refreshInventory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "直推失败，请稍后重试。");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="admin-block" aria-labelledby="my-code-inventory-title">
      <div className="admin-block-heading">
        <h2 id="my-code-inventory-title">产品激活码库</h2>
        {inventory && <span>可用 {inventory.availableCount} 枚</span>}
        <button type="button" className="admin-secondary" disabled={refreshing} onClick={() => void refreshInventory()}>
          {refreshing ? "刷新中…" : "刷新云仓"}
        </button>
      </div>
      {!inventory && !error && <p role="status">码库加载中…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {inventory?.needsRestock && <p className="admin-notice" role="status">库存低于补货点，请及时补货</p>}
      {inventory && inventory.codes.length === 0 && <p>暂无激活码</p>}
      {inventory && inventory.availableCount === 0 && inventory.codes.length === 0 && !restockPending && (
        <div className="coach-restock-form">
          <label htmlFor="coach-restock-note">补货需求说明</label>
          <textarea id="coach-restock-note" maxLength={500} value={restockNote} onChange={(event) => setRestockNote(event.target.value)} placeholder="例如：本周无码，申请补货" />
          <button type="button" className="admin-primary" disabled={busy === "restock"} onClick={() => void requestRestock()}>
            {busy === "restock" ? "提交中…" : "申请补货"}
          </button>
        </div>
      )}
      {inventory && inventory.codes.length > 0 && (
        <ul className="coach-code-list">
          {inventory.codes.map((item) => (
            <li key={item.codeId}>
              <code>{item.code}</code>
              <span>{item.boxSpec}</span>
              <button type="button" className="admin-secondary" onClick={() => void copy(item.codeId, item.code)}>
                {copiedId === item.codeId ? "已复制" : `复制 ${item.code}`}
              </button>
              {campers.length > 0 && (
                <div className="coach-code-push">
                  <label htmlFor={`coach-push-target-${item.codeId}`}>直推目标 {item.code}</label>
                  <select id={`coach-push-target-${item.codeId}`} value={targets[item.codeId] ?? ""} onChange={(event) => setTargets((current) => ({ ...current, [item.codeId]: event.target.value }))}>
                    <option value="" disabled>选择本人名下体验官</option>
                    {campers.map((camper) => <option key={camper.camperRef} value={camper.camperRef}>{camper.camperCode}</option>)}
                  </select>
                  <button type="button" className="admin-secondary" disabled={!targets[item.codeId] || busy === item.codeId} onClick={() => void push(item.codeId)}>
                    {busy === item.codeId ? "提交审核中…" : `推送激活码 ${item.code}`}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
