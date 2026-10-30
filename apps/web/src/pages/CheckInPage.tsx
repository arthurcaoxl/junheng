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
