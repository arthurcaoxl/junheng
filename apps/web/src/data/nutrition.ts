export type NutritionMetric = {
  value: string;
  numericValue?: number;
  suffix: string;
  label: string;
  detail: string;
};

export const nutritionMetrics: NutritionMetric[] = [
  { value: "23", numericValue: 23, suffix: "种", label: "菌菇精华", detail: "一杯汇集多样菌物营养" },
  { value: "40%+", numericValue: 40, suffix: "%+", label: "双蛋白矩阵", detail: "大豆分离蛋白 × 浓缩牛奶蛋白" },
  { value: "6", numericValue: 6, suffix: "种", label: "复合维生素", detail: "B1、B2、B6、叶酸、生物素、B12" },
];

export const mushroomNames = [
  "猴头菇", "茯苓", "金针菇", "竹荪", "杏鲍菇", "灵芝", "姬松茸", "黑木耳",
  "银耳", "灰树花", "黑皮鸡枞", "金顶侧耳", "金耳", "羊肚菌", "香菇", "绣球菌",
  "红菇", "滑子菇", "蛹虫草", "黑松露", "黑牛肝菌", "松茸", "口蘑",
] as const;

export type MushroomKnowledge = {
  name: string;
  tag: string;
  description: string;
  image: string;
  alt: string;
  credit: string;
  source: string;
};

export const mushroomKnowledge: MushroomKnowledge[] = [
  { name: "猴头菇", tag: "菌菇多糖", description: "猴头菇含有菌菇多糖等成分，是日常饮食中的特色菌菇食材。", image: "/images/mushrooms/hericium.webp", alt: "猴头菇实体照片", credit: "Becky · CC0", source: "https://commons.wikimedia.org/wiki/File:Hericium_erinaceus_104664221.jpg" },
  { name: "金针菇", tag: "膳食纤维", description: "金针菇含有膳食纤维，是日常餐桌上常见的菌菇食材。", image: "/images/mushrooms/enoki.webp", alt: "金针菇实体照片", credit: "Mitrofresh · CC BY-SA", source: "https://commons.wikimedia.org/wiki/File:Enoki_mushroom.jpg" },
  { name: "竹荪", tag: "菌中皇后", description: "竹荪以独特的网状菌裙和风味被人们认识，也是配方菌菇之一。", image: "/images/mushrooms/bamboo-fungus.webp", alt: "竹荪实体照片", credit: "Jorge Ochoa · CC BY-SA", source: "https://commons.wikimedia.org/wiki/File:Phallus_indusiatus.jpg" },
  { name: "羊肚菌", tag: "多种氨基酸", description: "羊肚菌含有多种氨基酸，以独特蜂窝状菌盖受到关注。", image: "/images/mushrooms/morel.webp", alt: "羊肚菌实体照片", credit: "Tom Zucker-Scharff · CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Morchella_esculenta_36771717.jpg" },
  { name: "灵芝", tag: "菌物原料", description: "灵芝是具有辨识度的菌物原料，以木质化菌盖和环纹为特征。", image: "/images/mushrooms/reishi.webp", alt: "灵芝实体照片", credit: "Eric Steinert · CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Ganoderma_lucidum_01.jpg" },
  { name: "蛹虫草", tag: "特色菌物", description: "蛹虫草是配方中的特色菌物原料，与其他菌菇共同组成多样配方。", image: "/images/mushrooms/cordyceps.webp", alt: "蛹虫草实体照片", credit: "mushroomclinicaltrials.com · CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Cordyceps_Militaris.jpg" },
  { name: "灰树花", tag: "舞茸", description: "灰树花又称舞茸，层叠生长的子实体具有独特形态和风味。", image: "/images/mushrooms/maitake.webp", alt: "灰树花实体照片", credit: "George Chernilevsky · 公有领域", source: "https://commons.wikimedia.org/wiki/File:Grifola_frondosa_2014_G1.jpg" },
  { name: "黑松露", tag: "块菌", description: "黑松露是生长于地下的块菌，以独特香气和表面纹理闻名。", image: "/images/mushrooms/truffle.webp", alt: "黑松露实体照片", credit: "Diego Delso · CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Tuber_melanosporum_-_trufa_negra,_Ágreda,_España.jpg" },
];

export const processSteps = [
  { title: "激流破壁", english: "CELL WALL BREAKING" },
  { title: "定向酶解", english: "DIRECTED ENZYMOLYSIS" },
  { title: "分子膜滤", english: "MOLECULAR FILTRATION" },
  { title: "低温浓缩", english: "LOW-TEMP CONCENTRATION" },
  { title: "量效配伍", english: "FORMULATION" },
] as const;

export const vitaminNotes = ["维生素 B1", "维生素 B2", "维生素 B6", "叶酸", "生物素", "维生素 B12"] as const;
export const proteinSourceNote = "数据依据品牌提供素材，具体以产品包装及正式检测资料为准";

export const researchInstitute = "北京千菌方菌物科学研究院";
export const researchInstituteSource = "https://qianjunfang.com/hzjg";

export const formulaStats = [
  { value: "6", suffix: "位", label: "国医大师/院士靶向组方*" },
  { value: "23", suffix: "种", label: "菌菇精华" },
] as const;

export const expertBackground = [
  { name: "李佃贵", title: "国医大师" },
  { name: "张大宁", title: "国医大师" },
  { name: "金世元", title: "国医大师" },
  { name: "石学敏", title: "国医大师、中国工程院院士" },
  { name: "孙光荣", title: "国医大师" },
  { name: "王琦", title: "国医大师、中国工程院院士" },
] as const;

export const foodStructureStory = {
  title: "一荤一素一菌菇",
  intro: "让菌菇回到日常一餐，也让“餐前伴侣”有了更自然的饮食结构背景。",
  detail: "2023年6月，中国保健协会菌物产业分会主办相关科普公益行动，北京千菌方菌物科学研究院为联合承办方之一。",
  source: "http://www.news.cn/health/20230619/80086b275ff84594a3f75b4f3ecff1a7/c.html",
} as const;

export const activeNutrition = [
  { name: "真菌多糖肽", english: "FUNGAL POLYSACCHARIDE PEPTIDES", description: "关注菌菇活性营养的释放与保留。" },
  { name: "麦角硫因", english: "ERGOTHIONEINE", description: "认识菌菇来源特色成分及其营养研究。" },
  { name: "菌菇活性营养", english: "ACTIVE FUNGI NUTRITION", description: "以多样菌菇配方，丰富日常营养选择。" },
] as const;

export const mechanismPaths = [
  { name: "小分子菌糖肽", english: "SMALL-MOLECULE GLYCOPEPTIDES", description: "从原料处理到营养释放，关注消化吸收过程。", steps: ["原料处理", "营养释放", "消化吸收"] },
  { name: "麦角硫因", english: "ERGOTHIONEINE", description: "认识菌菇来源特色成分及抗氧化营养研究。", steps: ["菌菇来源", "特色成分", "抗氧化营养研究"] },
] as const;
