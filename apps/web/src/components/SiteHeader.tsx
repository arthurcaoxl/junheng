import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { navigation, siteConfig } from "../config/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === "/";

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
      <Link className="brand-mark" to="/" aria-label="菌衡有道，返回首页" onClick={() => setOpen(false)}>
        <span className="brand-symbol" aria-hidden="true">菌</span>
        <span>
          <strong>{siteConfig.brand}</strong>
          <small>FUNGIBLEND</small>
        </span>
      </Link>
      <nav className="desktop-nav" aria-label="页面导航">
        {desktopItems}
      </nav>
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
