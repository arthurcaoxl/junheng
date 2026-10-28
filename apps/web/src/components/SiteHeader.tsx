import { useEffect, useState } from "react";
import { navigation, siteConfig } from "../config/site";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <header className="site-header">
      <a className="brand-mark" href="#hero" aria-label="菌衡有道，返回首屏" onClick={() => setOpen(false)}>
        <span className="brand-symbol" aria-hidden="true">菌</span>
        <span>
          <strong>{siteConfig.brand}</strong>
          <small>FUNGIBLEND</small>
        </span>
      </a>
      <nav className="desktop-nav" aria-label="页面导航">
        {navigation.map((item) => <a key={item.id} href={`#${item.id}`}>{item.label}</a>)}
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
        {navigation.map((item, index) => (
          <a key={item.id} href={`#${item.id}`} onClick={() => setOpen(false)}><span>0{index + 1}</span>{item.label}</a>
        ))}
      </nav>
    </header>
  );
}
