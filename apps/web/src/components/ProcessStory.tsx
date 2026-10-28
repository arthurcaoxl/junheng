import { processSteps } from "../data/nutrition";

export function ProcessStory() {
  return (
    <section className="process section-pad" id="process" data-theme="forest" aria-labelledby="process-title">
      <div className="section-index"><span>11</span><span>FIVE-STEP PROCESS</span></div>
      <header className="section-heading process-heading">
        <p className="eyebrow">从原料到一杯</p>
        <h2 id="process-title">5 重工艺，<br />一杯层层递进。</h2>
        <p>围绕真菌多糖肽、麦角硫因及菌菇活性营养的保留与释放，层层推进，服务日常营养补充。</p>
      </header>
      <ol className="process-list">
        {processSteps.map((step, index) => (
          <li className="process-step" key={step.title}>
            <span>0{index + 1}</span>
            <i aria-hidden="true"><b /></i>
            <h3>{step.title}</h3>
            <p>{step.english}</p>
          </li>
        ))}
      </ol>
      <p className="process-note">工艺名称依据品牌提供素材重新整理，具体工艺参数以正式产品资料为准。</p>
    </section>
  );
}
