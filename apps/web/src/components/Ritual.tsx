import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

const steps = [
  { title: "准备温水", detail: "约 300 ml，使用 40°C 以内的温水。" },
  { title: "撕开小袋", detail: "先倒水，再加入一袋菌衡膳食粉。" },
  { title: "充分搅拌", detail: "冲调均匀，即冲即饮。" },
  { title: "餐前饮用", detail: "每餐前 30–60 分钟，小口慢饮。" },
  { title: "正常用餐", detail: "搭配蔬菜、优质蛋白与适量主食。" },
];

export function Ritual() {
  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (typeof IntersectionObserver !== "function" || !sectionRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!autoPlay || !inView || reducedMotion) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % steps.length), 4500);
    return () => window.clearInterval(timer);
  }, [autoPlay, inView, reducedMotion]);

  const selectStep = (index: number) => {
    setActive(index);
    setAutoPlay(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % steps.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + steps.length) % steps.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = steps.length - 1;
    else return;
    event.preventDefault();
    selectStep(next);
    document.getElementById(`ritual-tab-${next}`)?.focus();
  };

  return (
    <section className="ritual section-pad" id="ritual" data-theme="cream" aria-labelledby="ritual-title" ref={sectionRef}>
      <div className="section-index"><span>14</span><span>PRE-MEAL RITUAL</span></div>
      <div className="ritual-heading">
        <p className="eyebrow">餐前的一小段仪式</p>
        <h2 id="ritual-title">让营养，<br />先到一步。</h2>
        <p>不必打乱原有的餐桌节奏。餐前一杯，慢慢饮用，再从容开始这一餐。</p>
      </div>
      <div className="ritual-metrics" aria-label="餐前冲调关键数据">
        <div><strong>30–60</strong><span>分钟餐前</span></div>
        <div><strong>约300</strong><span>ml 温水</span></div>
        <div><strong>≤40</strong><span>°C 水温</span></div>
      </div>
      <figure className="ritual-media"><img src="/images/lifestyle.webp" alt="手持冲调好的菌衡膳食粉，桌上摆放产品盒与多种菌菇" width="1099" height="910" loading="lazy" decoding="async" /></figure>
      <div className="ritual-interactive">
        <div className="ritual-steps" role="tablist" aria-label="餐前冲泡步骤" onKeyDown={onKeyDown}>
          {steps.map((step, index) => (
            <button
              type="button"
              role="tab"
              id={`ritual-tab-${index}`}
              aria-selected={active === index}
              aria-controls="ritual-panel"
              tabIndex={active === index ? 0 : -1}
              className="ritual-step-tab"
              key={step.title}
              onClick={() => selectStep(index)}
            >
              <span>0{index + 1}</span><strong>{step.title}</strong>
            </button>
          ))}
        </div>
        <div className="ritual-panel" role="tabpanel" id="ritual-panel" aria-labelledby={`ritual-tab-${active}`}>
          <span>STEP 0{active + 1}</span>
          <h3>{steps[active].title}</h3>
          <p>{steps[active].detail}</p>
        </div>
      </div>
      <p className="ritual-note">饮用方式依据品牌提供的食用说明；请结合个人饮食情况合理安排。</p>
    </section>
  );
}
