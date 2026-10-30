const comparison = [
  {
    label: "常见代餐思路",
    title: "围绕“替代一餐”设计",
    points: ["只见热量，难见均衡", "生命需要均衡"],
  },
  {
    label: "菌衡计划 · 餐前营养伴侣",
    title: "围绕“每一餐之前”设计",
    points: ["餐前 30–60 分钟，融入原有三餐", "23 种菌菇 × 双蛋白 × 6 种 B 族维生素", "5 重工艺与特殊膳食食品身份，重视营养边界"],
  },
] as const;

export function CategoryDifference() {
  return (
    <section className="difference section-pad" id="difference" data-theme="forest" aria-labelledby="difference-title">
      <div className="section-index"><span>03</span><span>CATEGORY DIFFERENCE</span></div>
      <header className="difference-heading">
        <p className="eyebrow">不是同一种产品，换一套说辞</p>
        <h2 id="difference-title">不是“更好的<span className="no-break">代餐</span>”，<br />是宏量营养 ×<br className="mobile-break" /> 活性菌物营养<br className="desktop-break" /><span className="no-break">协同的新路径。</span></h2>
        <p>不替代正常三餐，而是把营养补充放到餐前。差异来自配方逻辑、工艺积累与使用场景，而不是一句更响亮的承诺。</p>
      </header>
      <div className="difference-comparison">
        {comparison.map((item) => (
          <article className="difference-column" key={item.label}>
            <span>{item.label}</span>
            <h3>{item.title}</h3>
            <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
          </article>
        ))}
      </div>
      <div className="difference-metrics" aria-label="餐前营养伴侣的量化差异">
        <div><strong>23</strong><span>种菌菇精华</span></div>
        <div><strong>2</strong><span>类蛋白来源</span></div>
        <div><strong>6</strong><span>种 B 族维生素</span></div>
        <div><strong>5</strong><span>重工艺</span></div>
        <div><strong>30–60</strong><span>分钟 · 餐前场景</span></div>
      </div>
      <p className="difference-note">品类对比仅科学分析，不构成对任何品牌的贬损或功效承诺</p>
    </section>
  );
}
