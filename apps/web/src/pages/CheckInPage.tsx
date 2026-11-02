import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { SevenDayCheckIn } from "../components/SevenDayCheckIn";
import { SyncPanel } from "../components/SyncPanel";

export default function CheckInPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (hash === "#sync-panel") {
      // 从 Header 胶囊或其他页跳转进来时定位到同步区
      document.getElementById("sync-panel")?.scrollIntoView({ block: "start" });
    }
  }, [hash]);

  // 数据合规总授权统一在“打卡入口点击处”拦截（CheckInGateLink）；
  // 页面内不再弹授权窗——URL 直达用户的打卡数据由建档时的
  // consent_granted=false 默认标记兜底（见 writeCloudSnapshot）。
  return (
    <div className="check-in-page">
      <nav className="check-in-page-nav" aria-label="打卡页导航">
        <Link to="/">← 返回首页</Link>
      </nav>
      <SevenDayCheckIn />
      <SyncPanel />
    </div>
  );
}
