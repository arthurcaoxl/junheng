import { movementGoals } from "../data/lifestyle";

export function MovementGuide() {
  return (
    <section className="movement section-pad" id="movement" data-theme="cream" aria-labelledby="movement-title">
      <div className="section-index"><span>17</span><span>MOVE WITH A PLAN</span></div>
      <header className="movement-heading">
        <p className="eyebrow">营养之外，把身体重新用起来</p>
        <h2 id="movement-title">配合运动更高效，<br />可执行的三件事。</h2>
        <p>不靠一次剧烈运动补偿饮食，把有氧、抗阻与日常活动分配到一周。</p>
      </header>
      <div className="movement-grid">
        {movementGoals.map((goal) => (
          <article className="movement-card" key={goal.title}>
            <div><strong>{goal.value}</strong><span>{goal.unit}</span></div>
            <h3>{goal.title}</h3>
            <p>{goal.detail}</p>
          </article>
        ))}
      </div>
      <p className="movement-note">以上为一般健康成人的日常活动参考，可循序渐进、拆段完成。孕期、心血管疾病、关节损伤等特殊人群，请先咨询医生或专业人士，运动中如感不适应及时停止。</p>
    </section>
  );
}
