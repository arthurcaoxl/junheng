import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SiteHeader } from "./components/SiteHeader";
import { Hero } from "./components/Hero";
import { BrandPerspective } from "./components/BrandPerspective";
import { MetabolismSignals } from "./components/MetabolismSignals";
import { CategoryDifference } from "./components/CategoryDifference";
import { MetricsWall } from "./components/MetricsWall";
import { NutritionStory } from "./components/NutritionStory";
import { FormulaStrength } from "./components/FormulaStrength";
import { MushroomBenefits } from "./components/MushroomBenefits";
import { MushroomKnowledge } from "./components/MushroomKnowledge";
import { ProcessStory } from "./components/ProcessStory";
import { MetabolismMechanism } from "./components/MetabolismMechanism";
import { Ritual } from "./components/Ritual";
import { PlateGuide } from "./components/PlateGuide";
import { SceneGuide } from "./components/SceneGuide";
import { MovementGuide } from "./components/MovementGuide";
import { BodyStandards } from "./components/BodyStandards";
import { Research } from "./components/Research";
import { SevenDayCheckIn } from "./components/SevenDayCheckIn";
import { SiteFooter } from "./components/SiteFooter";
import { useReducedMotion } from "./hooks/useReducedMotion";
import "./styles.css";

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
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
  }, [reducedMotion]);

  return (
    <div className="site-shell" data-active-theme="forest" ref={rootRef}>
      <SiteHeader />
      <main>
        <Hero />
        <BrandPerspective />
        <MetabolismSignals />
        <CategoryDifference />
        <BodyStandards />
        <MetricsWall />
        <NutritionStory />
        <FormulaStrength />
        <MushroomBenefits />
        <MushroomKnowledge />
        <ProcessStory />
        <MetabolismMechanism />
        <Research />
        <Ritual />
        <PlateGuide />
        <SceneGuide />
        <MovementGuide />
        <SevenDayCheckIn />
      </main>
      <SiteFooter />
    </div>
  );
}
