import { describe, expect, it } from "vitest";
import { expertBackground, foodStructureStory, formulaStats, mushroomKnowledge, mushroomNames, nutritionMetrics, processSteps, researchInstitute, vitaminNotes } from "../data/nutrition";

describe("launch nutrition content", () => {
  it("keeps quantitative claims limited to approved source material", () => {
    expect(nutritionMetrics.map((item) => item.value)).toEqual(["23", "40%+", "6"]);
    expect(vitaminNotes).toHaveLength(6);
    expect(processSteps.map((item) => item.title)).toEqual(["激流破壁", "定向酶解", "分子膜滤", "低温浓缩", "量效配伍"]);
  });

  it("provides eight featured mushrooms and the complete 23-item directory", () => {
    expect(mushroomNames).toHaveLength(23);
    expect(mushroomKnowledge.map((item) => item.name)).toEqual(["猴头菇", "金针菇", "竹荪", "羊肚菌", "灵芝", "蛹虫草", "灰树花", "黑松露"]);
    expect(mushroomKnowledge.every((item) => item.image.endsWith(".webp"))).toBe(true);
    expect(mushroomKnowledge.every((item) => !/治疗|抗癌|减脂效率|修复|稳控血糖|全天候燃脂/.test(item.description))).toBe(true);
  });

  it("keeps the six-person formula background and titles consistent", () => {
    expect(researchInstitute).toBe("北京千菌方菌物科学研究院");
    expect(formulaStats[0].label).toBe("国医大师/院士靶向组方*");
    expect(expertBackground.map((item) => item.name)).toEqual(["李佃贵", "张大宁", "金世元", "石学敏", "孙光荣", "王琦"]);
    expect(expertBackground.filter((item) => item.title === "国医大师、中国工程院院士")).toHaveLength(2);
    expect(foodStructureStory.source).toContain("news.cn");
  });
});
