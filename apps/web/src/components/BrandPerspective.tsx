export function BrandPerspective() {
  return (
    <section className="perspective section-pad" id="perspective" data-theme="cream" aria-labelledby="perspective-title">
      <div className="section-index"><span>01</span><span>OUR PERSPECTIVE</span></div>
      <div className="perspective-heading">
        <p className="eyebrow">重新理解减重</p>
        <h2 id="perspective-title">吃对了，营养打底，<br />脂肪代谢才更有底气</h2>
      </div>
      <div className="perspective-body">
        <p className="lead">科学管理体重，不靠极端节食，不追求脱水式减重。</p>
        <p>饭前一杯，配合正常三餐和规律记录；即使应酬较多，也能把饮食搭配和体重变化看得更清楚。</p>
        <dl className="perspective-values">
          <div><dt>不只关注少吃</dt><dd>也关注蛋白质、维生素与日常营养补充</dd></div>
          <div><dt>不追求短期对抗</dt><dd>把餐前一杯变成容易坚持的小习惯</dd></div>
          <div><dt>不替代正常三餐</dt><dd>蔬菜、优质蛋白与适量主食仍然重要</dd></div>
        </dl>
      </div>
      <section className="management-principles" aria-label="科学体重管理的三大核心原则">
        <article>
          <span>01</span>
          <h3>热量平衡</h3>
          <p>不挨饿、不断碳水，在营养均衡前提下保持温和热量缺口，让饮食管理更容易长期坚持。</p>
        </article>
        <article>
          <span>02</span>
          <h3>营养均衡</h3>
          <p>脂肪代谢需要多种营养参与。23 种菌菇、双蛋白与 6 种维生素，作为日常膳食的营养补充。</p>
        </article>
        <article>
          <span>03</span>
          <h3>脂代谢调节</h3>
          <p>关注久坐、应酬等生活场景下的脂质代谢管理，通过菌菇与维生素矩阵补充营养，配合饮食、运动与长期记录。</p>
        </article>
      </section>
    </section>
  );
}
