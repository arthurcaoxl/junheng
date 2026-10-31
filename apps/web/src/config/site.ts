export const siteConfig = {
  brand: "菌衡计划",
  headerBrand: "菌衡计划 | 脂代谢研究所",
  platform: "菌衡计划·脂代谢研究所",
  platformEnglish: "FUNGIBLEND LIPID METABOLISM RESEARCH INSTITUTE",
  platformDisclaimer: "注：菌衡计划·脂代谢研究所为本品牌内部健康管理研究平台，非医疗或国家级学术机构。相关数据与成分科普不作为医疗诊断或治疗依据。",
  product: "菌衡膳食粉",
  slogan: "餐前精准膳食，",
  healthStatement: "重塑脂代谢平衡。",
  subtitle: "——23种菌菇精华 × 优质蛋白 × 复合维生素——",
  category: "特殊膳食食品·运动营养食品",
  version: "1.9.0",
} as const;

export const actionConfig = {
  consultation: { enabled: false, label: "咨询与留资", url: "" },
  purchase: { enabled: false, label: "立即购买", url: "" },
} as const;

export const navigation = [
  { id: "perspective", label: "品牌立场" },
  { id: "difference", label: "品类差异" },
  { id: "science", label: "科学体质" },
  { id: "body-standards", label: "自测标准" },
  { id: "metrics", label: "核心数字" },
  { id: "formula", label: "菌菇配方" },
  { id: "research", label: "临床研究" },
  { id: "ritual", label: "餐前冲调" },
  { id: "check-in", label: "21 天打卡" },
] as const;
