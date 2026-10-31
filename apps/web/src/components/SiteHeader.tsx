import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { navigation, siteConfig } from "../config/site";
import { useSyncStatus } from "../hooks/useSyncStatus";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onHome = pathname === "/";
  const { configured, email } = useSyncStatus();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  const desktopItems = onHome
    ? navigation.map((item) => item.id === "check-in"
        ? <Link key={item.id} to="/check-in">{item.label}</Link>
        : <a key={item.id} href={`#${item.id}`}>{item.label}</a>)
    : [<Link key="back-home" to="/">返回首页</Link>];

  const mobileItems = onHome
    ? navigation.map((item, index) => item.id === "check-in"
        ? <Link key={item.id} to="/check-in" onClick={() => setOpen(false)}><span>0{index + 1}</span>{item.label}</Link>
        : <a key={item.id} href={`#${item.id}`} onClick={() => setOpen(false)}><span>0{index + 1}</span>{item.label}</a>)
    : [<Link key="back-home" to="/" onClick={() => setOpen(false)}>返回首页</Link>];

  return (
    <header className="site-header">
      <Link className="brand-mark" to="/" aria-label="菌衡计划，返回首页" onClick={() => setOpen(false)}>
        <span className="brand-symbol" aria-hidden="true">菌</span>
        <span>
          <strong>{siteConfig.brand}</strong>
          <small>FUNGIBLEND</small>
        </span>
      </Link>
      <nav className="desktop-nav" aria-label="页面导航">
        {desktopItems}
      </nav>
      {configured && (email ? (
        <Link className="sync-status-pill is-synced user-center-link" to="/user-center" aria-label="用户中心">
          <span aria-hidden="true">👤</span><span className="user-center-label">用户中心</span>
        </Link>
      ) : (
        <button
          type="button"
          className="sync-status-pill"
          aria-label="未同步，绑定邮箱"
          onClick={() => {
            if (pathname.startsWith("/check-in")) {
              const panel = document.getElementById("sync-panel");
              panel?.scrollIntoView({ behavior: "smooth", block: "start" });
              window.setTimeout(() => {
                panel?.classList.remove("sync-panel-flash");
                if (panel) void panel.offsetWidth;
                panel?.classList.add("sync-panel-flash");
              }, 500);
            } else {
              navigate("/check-in#sync-panel");
            }
          }}
        >
          绑定邮箱
        </button>
      ))}
      <span className="header-note">餐前营养伴侣</span>
      <button
        type="button"
        className="mobile-menu-button"
        aria-label={open ? "关闭导航" : "打开导航"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" /><span aria-hidden="true" />
      </button>
      <nav id="mobile-navigation" className="mobile-nav" aria-label="移动端页面导航" hidden={!open}>
        {mobileItems}
      </nav>
    </header>
  );
}
