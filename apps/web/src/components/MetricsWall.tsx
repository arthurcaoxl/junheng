import { nutritionMetrics, proteinSourceNote } from "../data/nutrition";
import { CountUp } from "./CountUp";

export function MetricsWall() {
  return (
    <section className="metrics section-pad" id="metrics" data-theme="cream" aria-labelledby="metrics-title">
      <div className="section-index"><span>06</span><span>NUTRITION IN NUMBERS</span></div>
      <header className="section-heading metrics-heading">
        <p className="eyebrow">一杯的营养，不再一笔带过</p>
        <h2 id="metrics-title">一杯的营养密度</h2>
      </header>
      <div className="metrics-grid">
        {nutritionMetrics.map((metric, index) => (
          <article className="metric-card" key={metric.label}>
            <span className="metric-order">0{index + 1}</span>
            <div className="metric-value">
              {typeof metric.numericValue === "number"
                ? <CountUp value={metric.numericValue} suffix={metric.suffix} />
                : <>{metric.value}{metric.suffix}</>}
            </div>
            <h3>{metric.label}</h3>
            <p>{metric.detail}</p>
            {metric.value === "40%+" && <small>{proteinSourceNote}</small>}
          </article>
        ))}
      </div>
    </section>
  );
}
