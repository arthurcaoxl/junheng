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
      <section className="ergothioneine-detail" aria-label="麦角硫因成分科普">
        <header>
          <span>02 / ERGOTHIONEINE</span>
          <h3>什么是麦角硫因？</h3>
          <p>从成分来源到研究边界，认识这种菌菇来源的特色营养。</p>
        </header>
        <ol>
          <li><span>01</span><div><h4>菌菇来源</h4><p>麦角硫因是一种天然含硫氨基酸，存在于部分菌菇等食物中。</p></div></li>
          <li><span>02</span><div><h4>膳食获得</h4><p>人体不能自行合成，可通过日常膳食获得，是饮食结构中的一种营养补充。</p></div></li>
          <li><span>03</span><div><h4>研究关注</h4><p>常见于抗氧化与细胞营养相关研究，但成分研究不能直接推导为食用后的个体效果。</p></div></li>
          <li><span>04</span><div><h4>理性看待</h4><p>研究结论不等于产品功效。日常健康管理仍需结合均衡饮食、规律作息与适量运动。</p></div></li>
        </ol>
      </section>
      <div className="mechanism-synergy"><span>小分子菌糖肽</span><i aria-hidden="true">＋</i><span>麦角硫因</span><strong>从多样营养供给，到日常代谢管理</strong></div>
      <p className="mechanism-note">以上为成分与日常营养知识，不代表产品具有修复受损受体、改善胰岛素抵抗、治疗疾病或确定减重功效。</p>
    </section>
  );
}
