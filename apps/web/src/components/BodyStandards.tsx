export function BodyStandards() {
  return (
    <section className="standards section-pad" id="body-standards" data-theme="cream" aria-labelledby="standards-title">
      <div className="section-index"><span>05</span><span>BODY STANDARDS</span></div>
      <header className="section-heading standards-heading">
        <p className="eyebrow">公开标准速查</p>
        <h2 id="standards-title">看懂身体，<br />用两把公开的“尺子”。</h2>
        <p className="lead-copy">BMI 与腰围，是两个简单实用的日常观察入口；配合体脂率与肌肉量，才能看懂身体的真实变化。</p>
      </header>
      <div className="standards-grid">
        <figure className="standard-card">
          <img src="/images/bmi-standard.png" alt="中国成人 BMI 判定标准表" loading="lazy" decoding="async" />
          <figcaption>
            <strong>中国成人 BMI 判定标准</strong>
            <span>18.5–23.9 为正常范围（WS/T 428-2013）</span>
          </figcaption>
        </figure>
        <figure className="standard-card">
          <img src="/images/waist-standard.png" alt="根据腰围对成人中心型肥胖分类表" loading="lazy" decoding="async" />
          <figcaption>
            <strong>腰围与中心型肥胖分类</strong>
            <span>腰围是中心型肥胖的重要信号，比体重数字更敏感</span>
          </figcaption>
        </figure>
      </div>
      <div className="section-footnote"><span>NOTE 15</span><p>标准整理自公开发布稿，仅为健康知识分享，不构成医疗建议。</p></div>
    </section>
  );
}
