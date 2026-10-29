import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import Home from "./pages/Home";
import CheckInPage from "./pages/CheckInPage";
import { useReducedMotion } from "./hooks/useReducedMotion";
import "./styles.css";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  useEffect(() => {
    if (!isHome) return;
    const root = rootRef.current;
    if (!root) return;
    const context = gsap.context(() => {
      const links = Array.from(root.querySelectorAll<HTMLAnchorElement>(".desktop-nav a"));
      root.querySelectorAll<HTMLElement>("[data-theme]").forEach((section) => {
        ScrollTrigger.create({
          trigger: section,
          start: "top 45%",
          end: "bottom 45%",
          onToggle: (self) => {
            if (!self.isActive) return;
            root.dataset.activeTheme = section.dataset.theme ?? "cream";
            links.forEach((link) => link.removeAttribute("aria-current"));
            const current = links.find((link) => link.hash === `#${section.id}`);
            current?.setAttribute("aria-current", "location");
          },
        });
      });

      if (!reducedMotion) {
        gsap.from(".hero-copy > *", { opacity: 0, y: 60, duration: 0.9, stagger: 0.09, ease: "power3.out" });
        gsap.from(".hero-media", { opacity: 0, scale: 0.94, clipPath: "inset(100% 0 0 0)", duration: 1.2, delay: 0.2, ease: "power3.out" });
        gsap.to(".hero-watermark", {
          yPercent: 16,
          ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
        gsap.utils.toArray<HTMLElement>(".metric-card, .nutrition-card, .active-nutrition-card, .benefit-mushroom-card, .nutrition-explainer, .process-step, .mechanism-card, .difference-column, .movement-card, .signal-item, .standard-card, .research-fact-card, .research-recruit-card").forEach((item, index) => {
          gsap.from(item, {
            opacity: 0,
            y: 56,
            duration: 0.75,
            delay: (index % 3) * 0.06,
            ease: "power3.out",
            scrollTrigger: { trigger: item, start: "top 90%", once: true },
          });
        });
      }
    }, root);
    return () => context.revert();
  }, [isHome, reducedMotion]);

  return (
    <div className="site-shell" data-active-theme="forest" ref={rootRef}>
      <SiteHeader />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
