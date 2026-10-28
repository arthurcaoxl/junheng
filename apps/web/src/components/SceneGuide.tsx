import { useState } from "react";
import { diningScenes } from "../data/lifestyle";

export function SceneGuide() {
  const [active, setActive] = useState(0);
  const scene = diningScenes[active];

  const select = (index: number) => {
    setActive(index);
    document.getElementById(`scene-tab-${index}`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % diningScenes.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + diningScenes.length) % diningScenes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = diningScenes.length - 1;
    else return;
    event.preventDefault();
    select(next);
  };

  return (
    <section className="scene-guide section-pad" id="scene-guide" data-theme="forest" aria-labelledby="scene-title">
      <div className="section-index"><span>16</span><span>DINING IN REAL LIFE</span></div>
      <header className="scene-heading">
        <p className="eyebrow">真正需要管理的，是每一个具体场景</p>
        <h2 id="scene-title">餐桌不只在家的厨房。</h2>
      </header>
      <div className="scene-tabs" role="tablist" aria-label="饮食管理场景" onKeyDown={onKeyDown}>
        {diningScenes.map((item, index) => (
          <button type="button" role="tab" id={`scene-tab-${index}`} aria-label={item.name} aria-selected={active === index} aria-controls="scene-panel" tabIndex={active === index ? 0 : -1} key={item.name} onClick={() => setActive(index)}>
            <span>0{index + 1}</span><strong>{item.name}</strong>
          </button>
        ))}
      </div>
      <div className="scene-panel" role="tabpanel" id="scene-panel" aria-labelledby={`scene-tab-${active}`}>
        <div><span>{scene.kicker}</span><h3>{scene.title}</h3></div>
        <ol>{scene.advice.map((item, index) => <li key={item}><span>0{index + 1}</span><p>{item}</p></li>)}</ol>
      </div>
      <p className="scene-note">外食不必追求绝对完美，从下一口开始做更合适的选择。菌衡膳食粉是餐前营养伴侣，不替代三餐。</p>
    </section>
  );
}
