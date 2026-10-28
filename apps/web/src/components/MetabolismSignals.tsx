const signals = [
  { no: "01", title: "基础代谢下降", body: "身体进入“节能模式”，消耗变少" },
  { no: "02", title: "肌肉流失", body: "蛋白质补充不足，同步拉低代谢率" },
  { no: "03", title: "运动意愿降低", body: "越对抗身体，越难长期坚持" },
];

export function MetabolismSignals() {
  return (
    <section className="signals section-pad" id="metabolism-signals" data-theme="forest" aria-labelledby="signals-title">
      <div className="section-index"><span>02</span><span>METABOLISM SIGNALS</span></div>
      <header className="section-heading signals-heading">
        <p className="eyebrow">代谢保护机制</p>
        <h2 id="signals-title">营养不均时，<br />身体会亮起“饥荒信号”。</h2>
        <p className="lead-copy">吃得少，不等于吃得对。极端节食可能让营养摄入不足，也可能伴随肌肉流失。</p>
      </header>
      <div className="signal-list">
        {signals.map((signal) => (
          <div className="signal-item" key={signal.no}>
            <span className="signal-no">{signal.no}</span>
            <h3>{signal.title}</h3>
            <p>{signal.body}</p>
          </div>
        ))}
      </div>
      <div className="signal-sources">
        <span>现代营养缺失的三个来源</span>
        <p>精加工损耗　·　烹饪损失　·　糖油过量——热量够了，营养未必够。</p>
      </div>
      <div className="section-footnote"><span>NOTE 02</span><p>以上为营养机制知识梳理，仅为科普分享，不构成医疗建议。</p></div>
    </section>
  );
}
