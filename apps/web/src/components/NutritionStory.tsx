import { mushroomNames, proteinSourceNote, vitaminNotes } from "../data/nutrition";
import { MoleculeDiagram } from "./MoleculeDiagram";

export function NutritionStory() {
  return (
    <section className="nutrition section-pad" id="nutrition" data-theme="forest" aria-labelledby="nutrition-title">
      <div className="section-index"><span>07</span><span>TRIPLE NUTRITION</span></div>
      <header className="section-heading nutrition-header">
        <p className="eyebrow">菌菇 × 双蛋白 × 复合维生素</p>
        <h2 id="nutrition-title">3 重营养，<br />一杯有数。</h2>
        <p>不是模糊地讲“有营养”，而是把一杯里的组成讲清楚。</p>
      </header>
      <div className="nutrition-grid">
        <article className="nutrition-card nutrition-card-mushroom">
          <span className="nutrition-order">01 / FUNGI</span>
          <strong>23</strong>
          <h3>种菌菇精华</h3>
          <p>定向酶解带来小分子菌糖肽，叠加菌菇来源的麦角硫因——宏量营养之上，多一层菌物活性物质。</p>
          <div className="ingredient-tags" aria-label="23 种菌菇配料">
            {mushroomNames.map((name) => <span key={name}>{name}</span>)}
          </div>
        </article>
        <article className="nutrition-card nutrition-card-protein">
          <span className="nutrition-order">02 / PROTEIN</span>
          <strong>40%+</strong>
          <h3>双蛋白矩阵，营养有底气</h3>
          <p>大豆分离蛋白 × 浓缩牛奶蛋白，动植物蛋白搭配，丰富必需氨基酸来源，以氨基酸互补思路取长补短。</p>
          <p className="protein-basis">每 100 g 含蛋白质 40 g 以上*</p>
          <p className="protein-standard">PDCAAS（蛋白质消化率校正氨基酸评分）是国际通用的蛋白质质量评价指标，满分 1.0；具体评分需依据产品实际检测，不由配方直接推算。</p>
          <div className="protein-equation"><span>植物蛋白</span><i>＋</i><span>动物蛋白</span><b className="protein-equation-result">= 减脂期的“肌肉护城河”</b></div>
          <MoleculeDiagram />
          <small>* {proteinSourceNote}</small>
        </article>
        <article className="nutrition-card nutrition-card-vitamin">
          <span className="nutrition-order">03 / VITAMINS</span>
          <strong>6</strong>
          <h3>种复合维生素</h3>
          <p>6 种复合维生素参与能量及蛋白质等营养素的正常代谢，像营养协作中的“助攻手”，而非单独决定减重或肌肉增长。</p>
          <p>维生素 B1、B2、B6、叶酸、生物素与 B12，配合正常三餐，关注每一个营养细节。</p>
          <div className="ingredient-tags vitamin-tags" aria-label="复合维生素与营养强化成分">
            {vitaminNotes.map((name) => <span key={name}>{name}</span>)}
          </div>
        </article>
      </div>
      <p className="nutrition-footnote">配料与营养信息依据品牌提供素材整理，具体以产品实物包装为准。</p>
    </section>
  );
}
