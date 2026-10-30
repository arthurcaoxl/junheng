// 数据摘自产品包装营养成分表（每 100 g），按每袋 25 g 换算。
export const scienceFacts = [
  {
    value: "10.7",
    unit: "g / 袋",
    title: "优质蛋白",
    text: "大豆 + 乳清双来源，约占成人日需 18%。国人早餐蛋白常不足 10 g，一袋补上。",
  },
  {
    value: "≈80%",
    unit: "日需维生素 B1",
    title: "B 族全家桶",
    text: "B2、B6、B12、烟酸、叶酸、泛酸、生物素全覆盖，为能量代谢提供辅酶工具。",
  },
  {
    value: "650",
    unit: "mg / 袋",
    title: "左旋肉碱",
    text: "参与脂肪酸转运的营养素，品类中少见的添加量，常见于运动营养场景。",
  },
  {
    value: "≈100",
    unit: "kcal / 袋",
    title: "不占热量预算",
    text: "约半根香蕉的热量。三餐照吃，补位不靠饿。",
  },
  {
    value: "23",
    unit: "种菌菇",
    title: "定向酶解",
    text: "含黑松露、赤芝、红菇等名贵菌菇。麦角硫因等菌物活性在日常膳食中稀缺，烹饪损耗也大。",
  },
  {
    value: "PDCAAS",
    unit: "接近 1.0",
    title: "双蛋白 · 质量分",
    text: "大豆 + 乳清双来源，蛋白质氨基酸评分接近满分，数量与质量兼得。*",
  },
] as const;

export const scienceAdvantages = [
  {
    title: "独有配方",
    text: "23 种菌菇 × 定向酶解，6 位国医大师/院士组方背景（仅作组方背景展示，不构成专家代言）。",
  },
  {
    title: "量级差异",
    text: "B1 单袋即达日需约八成，左旋肉碱 650 mg/袋——把营养成分表做成竞争力。",
  },
  {
    title: "身份差异",
    text: "特殊膳食食品·运动营养食品（耐力类）。包装标注：饭前饮用最佳，每日 3 次，每次 1 袋。",
  },
] as const;

export const sciencePeople = [
  {
    name: "减脂期",
    kicker: "WEIGHT MANAGEMENT",
    title: "餐前 30–60 分钟 1 袋",
    points: [
      "先垫一杯，正餐自然少吃，制造温和热量缺口。",
      "目标是靠少摄入管理体重，而不是靠饿。",
      "包装用法：饭前饮用，每日 3 次，每次 1 袋。",
    ],
  },
  {
    name: "维持期",
    kicker: "DAILY BALANCE",
    title: "正常体质，把补位当成日常",
    points: [
      "餐后波动更平缓，全天蛋白分布更均匀。",
      "防的是“悄悄变胖”：正常到超重往往每年只多 1–2 kg，毫无察觉。",
      "它是平衡器，不是燃烧剂，不会让人无限瘦下去。",
    ],
  },
  {
    name: "运动期",
    kicker: "ACTIVE LIFESTYLE",
    title: "运动后 30 分钟内 1 袋",
    points: [
      "产品身份即运动营养食品（耐力类）。",
      "约 10.7 g 优质蛋白 + B 族，配合运动后的修复窗口。",
      "耐力运动前后均可按包装用法补充。",
    ],
  },
] as const;

export const scienceMeals = [
  {
    name: "早餐",
    time: "7:00–8:00",
    rows: [
      {
        dimension: "餐后波动",
        without: "馒头、粥为主的早餐，餐后血糖冲高快降，上午容易犯困。",
        withDrink: "蛋白与纤维先入胃，有助于延缓胃排空，餐后波动更平缓。",
      },
      {
        dimension: "蛋白利用",
        without: "早餐蛋白常不足 10 g。",
        withDrink: "补约 10.7 g 优质蛋白，填补早餐蛋白缺口。",
      },
      {
        dimension: "代谢启动",
        without: "基础代谢缓慢爬升。",
        withDrink: "B 族作为能量代谢辅酶随早餐进场。",
      },
    ],
  },
  {
    name: "午餐",
    time: "11:30–12:00",
    rows: [
      {
        dimension: "进食节奏",
        without: "饿了半天，容易吃快吃多。",
        withDrink: "液体先行，饱腹感提前，有助于正餐不过量。",
      },
      {
        dimension: "午后状态",
        without: "外食油脂高峰，餐后血液涌向胃肠，容易犯困。",
        withDrink: "餐后波动更小，下午精力更稳。",
      },
    ],
  },
  {
    name: "晚餐",
    time: "17:30–18:30",
    rows: [
      {
        dimension: "晚餐热量",
        without: "一天中最大的社交餐，失控高发。",
        withDrink: "先垫一杯，正餐更容易刹住。",
      },
      {
        dimension: "夜间修复",
        without: "蛋白往往集中在一餐摄入。",
        withDrink: "全天蛋白分布更均匀，夜间修复有原料。",
      },
    ],
  },
] as const;
