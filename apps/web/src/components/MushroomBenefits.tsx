import { mushroomKnowledge } from "../data/nutrition";

const featured = mushroomKnowledge.filter((item) => ["灵芝", "蛹虫草", "灰树花", "黑松露"].includes(item.name));
const explainers = [
  {
    number: "01",
    title: "餐后血糖管理",
    subtitle: "从餐前营养，到更从容的三餐",
    steps: ["菌菇与膳食纤维", "认识消化过程", "关注餐后血糖与饥饿感管理"],
    icon: "curve",
  },
  {
    number: "02",
    title: "日常肠道营养",
    subtitle: "认识菌菇营养与肠道饮食的关系",
    steps: ["多样菌菇营养", "认识肠道菌群与膳食纤维", "融入日常饮食与饱腹感管理"],
    icon: "network",
  },
] as const;

function ExplainerIcon({ type }: { type: "curve" | "network" }) {
  return (
    <svg className="explainer-icon" viewBox="0 0 120 120" aria-hidden="true">
      {type === "curve" ? (
        <>
          <path d="M18 96V22M18 96h86" />
          <path d="M23 84c20-1 22-36 39-36 18 0 14 24 38 18" />
          <circle cx="62" cy="48" r="5" />
        </>
      ) : (
        <>
          <circle cx="60" cy="60" r="16" /><circle cx="25" cy="30" r="7" /><circle cx="96" cy="28" r="7" /><circle cx="98" cy="91" r="7" /><circle cx="24" cy="92" r="7" />
          <path d="m31 35 18 15m24-1 17-14M73 72l19 14M47 72 30 86" />
        </>
      )}
    </svg>
  );
}

export function MushroomBenefits() {
  return (
    <section className="benefits section-pad" id="benefits" data-theme="cream" aria-labelledby="benefits-title">
      <div className="section-index"><span>09</span><span>MUSHROOM NUTRITION</span></div>
      <header className="section-heading benefits-heading">
        <p className="eyebrow">从一杯菌菇配方，读懂日常营养</p>
        <h2 id="benefits-title">四大菌菇助攻，<br />营养各有特点。</h2>
        <p>把原料讲清楚，把与三餐相关的营养知识讲明白。</p>
      </header>
      <div className="benefit-mushroom-grid">
        {featured.map((item, index) => (
          <article className="benefit-mushroom-card" key={item.name}>
            <div className="benefit-image-wrap">
              <img src={item.image} alt={item.alt} width="1200" height="1200" loading="lazy" decoding="async" />
              <span>0{index + 1}</span>
              <a className="benefit-photo-credit" href={item.source} target="_blank" rel="noreferrer" aria-label={`${item.name}图片来源：${item.credit}`}>图：{item.credit}</a>
            </div>
            <div><p>{item.tag}</p><h3>{item.name}</h3><span>{item.description}</span></div>
          </article>
        ))}
      </div>
      <div className="nutrition-explainers">
        {explainers.map((item) => (
          <article className="nutrition-explainer" key={item.title}>
            <div className="explainer-heading">
              <span>{item.number} / NUTRITION GUIDE</span>
              <ExplainerIcon type={item.icon} />
              <h3>{item.title}</h3>
              <p>{item.subtitle}</p>
            </div>
            <ol>
              {item.steps.map((step, index) => (
                <li key={step}><span>0{index + 1}</span><strong>{step}</strong>{index < item.steps.length - 1 && <i aria-hidden="true">↓</i>}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
      <p className="benefits-note">以上为菌菇原料与日常饮食营养知识，不代表产品具有治疗、降糖或确定减重功效。</p>
    </section>
  );
}
