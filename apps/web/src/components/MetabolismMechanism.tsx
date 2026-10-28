import { mechanismPaths } from "../data/nutrition";

export function MetabolismMechanism() {
  return (
    <section className="mechanism section-pad" id="mechanism" data-theme="forest" aria-labelledby="mechanism-title">
      <div className="section-index"><span>12</span><span>ACTIVE NUTRITION MECHANISM</span></div>
      <header className="section-heading mechanism-heading">
        <p className="eyebrow">两类成分，一路协同营养思路</p>
        <h2 id="mechanism-title">代谢营养 × 活性菌物，<br />专属协同优势</h2>
      </header>
      <div className="mechanism-grid">
        {mechanismPaths.map((item, index) => (
          <article className="mechanism-card" key={item.name}>
            <span>0{index + 1} / {item.english}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
            <ol>{item.steps.map((step, stepIndex) => <li key={step}><span>0{stepIndex + 1}</span><strong>{step}</strong></li>)}</ol>
          </article>
        ))}
      </div>
      <div className="mechanism-synergy"><span>小分子菌糖肽</span><i aria-hidden="true">＋</i><span>麦角硫因</span><strong>从多样营养供给，到日常代谢管理</strong></div>
      <p className="mechanism-note">以上为成分与日常营养知识，不代表产品具有修复受损受体、改善胰岛素抵抗、治疗疾病或确定减重功效。</p>
    </section>
  );
}
