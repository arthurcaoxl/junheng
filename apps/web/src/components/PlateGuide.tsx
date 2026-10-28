import { useState } from "react";
import { plateParts } from "../data/lifestyle";

export function PlateGuide() {
  const [active, setActive] = useState(0);
  const item = plateParts[active];

  const select = (index: number) => {
    setActive(index);
    document.getElementById(`plate-tab-${index}`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (active + 1) % plateParts.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (active - 1 + plateParts.length) % plateParts.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = plateParts.length - 1;
    else return;
    event.preventDefault();
    select(next);
  };

  return (
    <section className="plate-guide section-pad" id="plate-guide" data-theme="cream" aria-labelledby="plate-title">
      <div className="section-index"><span>15</span><span>THE 2·1·1 PLATE</span></div>
      <div className="plate-layout">
        <header className="plate-copy">
          <p className="eyebrow">不用计算每一口，也能看清一餐</p>
          <h2 id="plate-title">211 饮食法，<br />把一餐摆明白。</h2>
          <p>2 拳蔬菜、1 拳优质蛋白、1 拳主食。餐前一杯是营养伴侣，正常吃饭仍然是主角。</p>
          <div className="plate-example" role="tabpanel" id="plate-panel" aria-labelledby={`plate-tab-${active}`}>
            <span>{item.ratio} · 食物示例</span>
            <p>{item.examples}</p>
            <small>{item.detail}</small>
          </div>
        </header>
        <div className="plate-interactive">
          <p className="plate-interaction-hint"><span aria-hidden="true">↖</span>点按餐盘分区，查看食物示例</p>
          <div className="plate-frame">
            <div className="plate-visual" role="tablist" aria-label="211 餐盘组成" onKeyDown={onKeyDown}>
              {plateParts.map((part, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`plate-tab-${index}`}
                  aria-selected={active === index}
                  aria-controls="plate-panel"
                  tabIndex={active === index ? 0 : -1}
                  className={`plate-part plate-part-${index + 1}`}
                  key={part.name}
                  onClick={() => setActive(index)}
                >
                  <strong>{part.ratio.split(part.name)[0]}</strong>
                  <span>{part.name}</span>
                  <small>{active === index ? "正在查看 ✓" : "查看示例 ↗"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="plate-note">拳头法仅为日常估量，不是精确营养处方；孕期、儿童、老年人及有特殊疾病或营养需求者，请遵医嘱或咨询专业营养师。</p>
    </section>
  );
}
