import { useState } from "react";
import { nutritionLabel, nutritionLabelNote, nutritionMetrics, proteinSourceNote } from "../data/nutrition";
import { CountUp } from "./CountUp";

export function MetricsWall() {
  const [labelOpen, setLabelOpen] = useState(false);

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

      <div className="metrics-label">
        <button
          type="button"
          className="metrics-label-toggle"
          aria-expanded={labelOpen}
          aria-controls="metrics-label-panel"
          onClick={() => setLabelOpen((open) => !open)}
        >
          <span>{labelOpen ? "收起营养成分表" : "查看完整营养成分表"}</span>
          <span className="metrics-label-chevron" aria-hidden="true">↓</span>
        </button>
        {labelOpen && (
          <div className="metrics-label-panel" id="metrics-label-panel">
            <table className="metrics-label-table">
              <caption>营养成分表</caption>
              <thead>
                <tr><th scope="col">项目</th><th scope="col">每 100 克</th><th scope="col">每袋（25 克）</th></tr>
              </thead>
              <tbody>
                {nutritionLabel.map((row) => (
                  <tr key={row.name}>
                    <th scope="row">{row.name}</th>
                    <td>{row.per100g}</td>
                    <td>{row.perBag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="metrics-label-note">{nutritionLabelNote}</p>
          </div>
        )}
      </div>
    </section>
  );
}
