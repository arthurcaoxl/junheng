import { activeNutrition, expertBackground, foodStructureStory, formulaStats, researchInstitute, researchInstituteSource } from "../data/nutrition";

export function FormulaStrength() {
  return (
    <section className="formula section-pad" id="formula" data-theme="cream" aria-labelledby="formula-title">
      <div className="section-index"><span>08</span><span>FORMULA STRENGTH</span></div>
      <header className="section-heading formula-heading">
        <p className="eyebrow">从组方背景，到一杯活性营养</p>
        <h2 id="formula-title">药食同源菌菇核心优势</h2>
        <p className="research-institute">研发机构｜{researchInstitute}</p>
      </header>
      <div className="formula-stats">
        {formulaStats.map((item) => (
          <article key={item.label}>
            <strong>{item.value}<span>{item.suffix}</span></strong>
            <h3 aria-label={`${item.value} ${item.suffix}${item.label}`}>{item.label}</h3>
          </article>
        ))}
      </div>
      <div className="expert-background" aria-label="六位国医大师及院士靶向组方名单">
        {expertBackground.map((item) => (
          <article key={item.name}>
            <h3>{item.name}</h3>
            <p>{item.title}</p>
          </article>
        ))}
      </div>
      <a className="formula-source" href={researchInstituteSource} target="_blank" rel="noreferrer">查看研发机构合作机构公开信息 ↗</a>
      <div className="active-nutrition-grid">
        {activeNutrition.map((item, index) => (
          <article className="active-nutrition-card" key={item.name}>
            <span>0{index + 1} / {item.english}</span>
            <h3>{item.name}</h3>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
      <p className="formula-note">* 据品牌提供资料，仅作组方背景展示，不构成专家代言或产品功效背书；组方信息以正式产品资料为准。</p>
      <div className="food-structure-story" id="food-structure">
        <div className="food-structure-heading">
          <span>BRAND STORY / FOOD STRUCTURE</span>
          <h3>{foodStructureStory.title}</h3>
          <p>{foodStructureStory.intro}</p>
        </div>
        <div className="food-structure-equation" aria-label="一荤加一素加一菌菇">
          <span>一荤</span><i>＋</i><span>一素</span><i>＋</i><span>一菌菇</span>
        </div>
        <div className="food-structure-source">
          <p>{foodStructureStory.detail}</p>
          <a href={foodStructureStory.source} target="_blank" rel="noreferrer">阅读新华网公开报道 ↗</a>
        </div>
      </div>
    </section>
  );
}
