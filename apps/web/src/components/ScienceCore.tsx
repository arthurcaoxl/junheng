import { useState } from "react";
import { Link } from "react-router";
import { scienceAdvantages, scienceFacts, scienceMeals, sciencePeople } from "../data/science";

export function ScienceCore() {
  const [personIndex, setPersonIndex] = useState(0);
  const [mealIndex, setMealIndex] = useState(0);
  const person = sciencePeople[personIndex];
  const meal = scienceMeals[mealIndex];

  const tabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, count: number, active: number, select: (index: number) => void, prefix: string) => {
    let next = active;
    if (event.key === "ArrowRight") next = (active + 1) % count;
    else if (event.key === "ArrowLeft") next = (active - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    else return;
    event.preventDefault();
    select(next);
    document.getElementById(`${prefix}-${next}`)?.focus();
  };

  return (
    <section className="science section-pad" id="science" data-theme="cream" aria-labelledby="science-title">
      <div className="section-index"><span>04</span><span>SCIENCE OF DAILY BALANCE</span></div>
      <header className="science-heading">
        <p className="eyebrow">科学体质管理的核心</p>
        <h2 id="science-title">三餐之外，<br />一袋补到位。</h2>
        <p>饭前一杯，约 100 kcal，补上三餐最缺的：蛋白质、B 族维生素，以及日常膳食里稀缺的菌物活性。它不是代餐，不替代三餐；也不会让人无限瘦下去——它更像防止身体悄悄发胖漂移的平衡器。</p>
      </header>

      <div className="science-facts" aria-label="每袋实测营养数据">
        {scienceFacts.map((fact) => (
          <article className="science-card" key={fact.title}>
            <strong>{fact.value}{fact.unit && <span>{fact.unit}</span>}</strong>
            <h3>{fact.title}</h3>
            <p>{fact.text}</p>
          </article>
        ))}
      </div>
      <p className="science-source">数据摘自产品包装营养成分表（每 100 g），按每袋 25 g 换算，日需占比为估算，具体以营养标签为准。*PDCAAS：国际通用的蛋白质质量评分，满分为 1.0，越高代表氨基酸组成越接近人体需求；具体以产品实际检测为准。</p>

      <div className="science-advantages" aria-label="产品独特优势">
        {scienceAdvantages.map((item, index) => (
          <article key={item.title}><span>0{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>
        ))}
      </div>

      <div className="science-people">
        <h3 className="science-subtitle">三类人，三种用法</h3>
        <div className="science-tabs" role="tablist" aria-label="人群用法" onKeyDown={(event) => tabKeyDown(event, sciencePeople.length, personIndex, setPersonIndex, "science-person-tab")}>
          {sciencePeople.map((item, index) => (
            <button type="button" role="tab" id={`science-person-tab-${index}`} aria-selected={personIndex === index} aria-controls="science-people-panel" tabIndex={personIndex === index ? 0 : -1} key={item.name} onClick={() => setPersonIndex(index)}>
              <span>0{index + 1}</span><strong>{item.name}</strong>
            </button>
          ))}
        </div>
        <div className="science-panel" role="tabpanel" id="science-people-panel" aria-labelledby={`science-person-tab-${personIndex}`}>
          <div><span>{person.kicker}</span><h4>{person.title}</h4></div>
          <ol>{person.points.map((point, index) => <li key={point}><span>0{index + 1}</span><p>{point}</p></li>)}</ol>
        </div>
      </div>

      <div className="science-meals">
        <h3 className="science-subtitle">餐前一杯，对三餐代谢的影响</h3>
        <div className="science-tabs" role="tablist" aria-label="三餐代谢时间轴" onKeyDown={(event) => tabKeyDown(event, scienceMeals.length, mealIndex, setMealIndex, "science-meal-tab")}>
          {scienceMeals.map((item, index) => (
            <button type="button" role="tab" id={`science-meal-tab-${index}`} aria-selected={mealIndex === index} aria-controls="science-meal-panel" tabIndex={mealIndex === index ? 0 : -1} key={item.name} onClick={() => setMealIndex(index)}>
              <span>{item.time}</span><strong>{item.name}</strong>
            </button>
          ))}
        </div>
        <div className="science-meal-panel" role="tabpanel" id="science-meal-panel" aria-labelledby={`science-meal-tab-${mealIndex}`}>
          {meal.rows.map((row) => (
            <div className="science-meal-row" key={row.dimension}>
              <h4>{row.dimension}</h4>
              <div className="science-meal-cols">
                <div className="science-meal-col science-meal-before"><span>未补充</span><p>{row.without}</p></div>
                <div className="science-meal-arrow" aria-hidden="true">→</div>
                <div className="science-meal-col science-meal-after"><span>餐前一杯</span><p>{row.withDrink}</p></div>
              </div>
            </div>
          ))}
        </div>
        <p className="science-note">以上为营养机制知识，不构成功效承诺。</p>
      </div>

      <p className="science-cta">想看见自己的节奏？<Link to="/check-in">去 21 天打卡，记录三餐之外的变化 →</Link></p>
    </section>
  );
}
