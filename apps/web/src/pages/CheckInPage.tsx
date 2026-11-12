import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { BoxCodeActivation } from "../components/BoxCodeActivation";
import { SevenDayCheckIn } from "../components/SevenDayCheckIn";
import { SyncPanel } from "../components/SyncPanel";
import {
  ActivationStatusError,
  fetchMyActivationStatus,
  type ActivationStatusErrorKind,
  type MyActivationStatus,
} from "../services/boxCodeActivation";
import { openSyncModal } from "../services/syncUi";

export default function CheckInPage() {
  const { hash } = useLocation();
  const [status, setStatus] = useState<MyActivationStatus | null>(null);
  const [errorKind, setErrorKind] = useState<ActivationStatusErrorKind | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (hash === "#sync-panel") {
      // 从 Header 胶囊或其他页跳转进来时定位到同步区
      document.getElementById("sync-panel")?.scrollIntoView({ block: "start" });
    }
  }, [hash]);

  useEffect(() => {
    let alive = true;
    fetchMyActivationStatus().then((nextStatus) => {
      if (alive) setStatus(nextStatus);
    }).catch((cause: unknown) => {
      if (!alive) return;
      setErrorKind(cause instanceof ActivationStatusError ? cause.kind : "unavailable");
    });
    return () => { alive = false; };
  }, [attempt]);

  const retry = () => {
    setStatus(null);
    setErrorKind(null);
    setAttempt((value) => value + 1);
  };

  // 数据合规总授权统一在“打卡入口点击处”拦截（CheckInGateLink）；
  // 页面内不再弹授权窗——URL 直达用户的打卡数据由建档时的
  // consent_granted=false 默认标记兜底（见 writeCloudSnapshot）。
  return (
    <div className="check-in-page">
      <nav className="check-in-page-nav" aria-label="打卡页导航">
        <Link to="/">← 返回首页</Link>
      </nav>
      {status === null ? (
        <section className="sync-panel">
          {errorKind === "unauthorized" ? (
            <>
              <p className="sync-panel-error" role="alert">登录状态已失效，请重新登录。</p>
              <button
                type="button"
                className="sync-panel-primary"
                onClick={() => openSyncModal("restore", { onSuccess: retry })}
              >
                重新登录
              </button>
            </>
          ) : errorKind === "unavailable" ? (
            <>
              <p className="sync-panel-error" role="alert">激活状态读取失败，请稍后重试。</p>
              <button type="button" className="sync-panel-primary" onClick={retry}>重试</button>
            </>
          ) : <p className="sync-panel-status" role="status">正在确认打卡权限</p>}
        </section>
      ) : status.state !== "legacy_granted" && <BoxCodeActivation status={status} />}
      {(status?.state === "active" || status?.state === "legacy_granted") && (
        <SevenDayCheckIn activationStatus={status} />
      )}
      <SyncPanel />
    </div>
  );
}
