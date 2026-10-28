import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

type CountUpProps = { value: number; suffix: string };

export function CountUp({ value, suffix }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let frame = 0;
    const showFinal = () => { frame = requestAnimationFrame(() => setDisplayed(value)); };

    if (reducedMotion || typeof IntersectionObserver !== "function" || !ref.current) {
      showFinal();
      return () => cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer?.disconnect();
      const startedAt = performance.now();
      const tick = (time: number) => {
        const progress = Math.min((time - startedAt) / 900, 1);
        setDisplayed(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.35 });
    observer.observe(ref.current);

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, reducedMotion]);

  return (
    <span className="count-up" ref={ref} aria-label={`${value}${suffix}`}>
      <span aria-hidden="true">{displayed}{suffix}</span>
    </span>
  );
}
