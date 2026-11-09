import { useCallback, useEffect, useState } from "react";
import {
  COACH_PENDING_REVIEWS_EVENT,
  fetchCoachPendingReviews,
  type CoachPendingReview,
} from "../../services/codePool";

export default function CoachPendingReviews() {
  const [items, setItems] = useState<CoachPendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await fetchCoachPendingReviews());
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "在审激活码读取失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUpdated = () => { void refresh(); };
    window.addEventListener(COACH_PENDING_REVIEWS_EVENT, onUpdated);
    return () => window.removeEventListener(COACH_PENDING_REVIEWS_EVENT, onUpdated);
  }, [refresh]);

  return (
    <section className="admin-block coach-dashboard-panel" aria-labelledby="coach-pending-reviews-title">
      <div className="admin-block-heading">
        <h2 id="coach-pending-reviews-title">在审激活码</h2>
        <span>在审 {items.length} 枚</span>
        <button type="button" className="admin-secondary" disabled={loading} onClick={() => void refresh()}>
          {loading ? "刷新中…" : "刷新在审"}
        </button>
      </div>
      {loading && items.length === 0 && <p role="status">在审激活码加载中…</p>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="admin-empty">暂无在审激活码。</p>}
      {items.length > 0 && (
        <ul className="coach-pending-review-list">
          {items.map((item) => (
            <li key={item.codeId}>
              <code>{item.code}</code>
              <span>{item.camperCode}</span>
              <time dateTime={item.requestedAt}>{item.requestedAt}</time>
              <span>{item.entryPath === "manual_code" ? "手动输码" : "教练直推"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
