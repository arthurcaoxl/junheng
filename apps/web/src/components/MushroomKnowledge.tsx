import { useState } from "react";
import { mushroomKnowledge, mushroomNames } from "../data/nutrition";

export function MushroomKnowledge() {
  const [active, setActive] = useState(0);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const item = mushroomKnowledge[active];

  const select = (index: number) => {
    setActive(index);
    document.getElementById(`mushroom-tab-${index}`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % mushroomKnowledge.length;
    else if (event.key === "ArrowLeft") next = (active - 1 + mushroomKnowledge.length) % mushroomKnowledge.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = mushroomKnowledge.length - 1;
    else return;
    event.preventDefault();
    select(next);
  };

  return (
    <section className="knowledge section-pad" id="knowledge" data-theme="cream" aria-labelledby="knowledge-title">
      <div className="section-index"><span>10</span><span>MEET THE MUSHROOMS</span></div>
      <header className="section-heading knowledge-heading">
        <p className="eyebrow">一杯里的菌物世界</p>
        <h2 id="knowledge-title">认识菌菇，<br />不止记住数字。</h2>
      </header>
      <div className="knowledge-stage">
        <div className="mushroom-photo">
          <img key={item.image} src={item.image} alt={item.alt} loading="lazy" decoding="async" width="1200" height="1200" />
          <span className="orbit-number">0{active + 1}</span>
          <span className="mushroom-photo-caption">FUNGI PORTRAIT / {item.name}</span>
          <a className="mushroom-photo-credit" href={item.source} target="_blank" rel="noreferrer">图片：{item.credit}</a>
        </div>
        <div className="knowledge-panel" role="tabpanel" id="mushroom-panel" aria-labelledby={`mushroom-tab-${active}`}>
          <span className="knowledge-tag">{item.tag}</span>
          <h3>{item.name}</h3>
          <p>{item.description}</p>
          <small>原料知识不等于产品功效承诺，配方信息以产品包装为准。</small>
        </div>
      </div>
      <div className="mushroom-tabs" role="tablist" aria-label="菌菇知识" onKeyDown={onKeyDown}>
        {mushroomKnowledge.map((mushroom, index) => (
          <button
            type="button"
            role="tab"
            id={`mushroom-tab-${index}`}
            aria-selected={active === index}
            aria-controls="mushroom-panel"
            tabIndex={active === index ? 0 : -1}
            key={mushroom.name}
            onClick={() => setActive(index)}
          >
            <span>0{index + 1}</span><strong>{mushroom.name}</strong><i aria-hidden="true">↗</i>
          </button>
        ))}
      </div>
      <div className="mushroom-directory-wrap">
        <button className="directory-toggle" type="button" aria-expanded={directoryOpen} aria-controls="mushroom-directory" onClick={() => setDirectoryOpen((open) => !open)}>
          <span>{directoryOpen ? "收起菌菇目录" : "展开全部 23 种菌菇"}</span><i aria-hidden="true">{directoryOpen ? "−" : "+"}</i>
        </button>
        <ol id="mushroom-directory" className="mushroom-directory" aria-label="完整 23 种菌菇目录" hidden={!directoryOpen}>
          {mushroomNames.map((name, index) => <li key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></li>)}
        </ol>
      </div>
      <div className="medicinal-band">
        <div className="medicinal-copy">
          <span className="knowledge-tag">药食同源</span>
          <h3>从药典到餐桌，菌物入食。</h3>
          <p>灵芝、茯苓、冬虫夏草、猴头菇、银耳、黑木耳等，均为药食同源真菌；云芝被《中国药典》收录；平菇、香菇中的麦角硫因，是抗氧化营养研究持续关注的热点成分。</p>
          <small>内容为菌物营养知识梳理，药材与食材信息整理自公开资料，不代表治疗功效。</small>
        </div>
      </div>
    </section>
  );
}
