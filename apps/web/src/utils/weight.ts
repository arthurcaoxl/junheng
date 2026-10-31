/**
 * 体重多节点算法（storage-v3 增量扩展的唯一实现）。
 * 契约：docs/contracts/storage-v3.md「体重多节点扩展」。
 * 规则要点：weights 存原始称重值；净重使用时现算；weight 仅为派生缓存。
 */

export type WeightNode = "morning" | "noon" | "evening";

export type NodeWeights = Partial<Record<WeightNode, string>>;

/** 结构化读取：不依赖 DayRecord 完整类型，便于在契约扩展前后复用。 */
export type WeightReadableDay = {
  weight?: string;
  weights?: NodeWeights;
  clothes?: string;
};

export const MIN_VALID_NET_KG = 20;

export const WEIGHT_NODES: { key: WeightNode; label: string; hint: string; ratio: number }[] = [
  { key: "morning", label: "早晨体重（空腹）", hint: "最准确", ratio: 0.6 },
  { key: "noon", label: "中午体重", hint: "", ratio: 0.2 },
  { key: "evening", label: "晚间体重", hint: "", ratio: 0.2 },
];

/** 解析称重/衣物数值：有限、>0 才有效；衣物允许 0。 */
export function parseKg(value: unknown, { allowZero = false } = {}): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (allowZero ? number < 0 : number <= 0) return null;
  return number;
}

/** 衣物重量：非法或缺省一律按 0，绝不预设非零默认值。 */
export function clothesKg(value: unknown): number {
  return parseKg(value, { allowZero: true }) ?? 0;
}

/** 净重 = 称重 − 衣物；称重非法或净重 < 20 kg 返回 null（UI 负责警告）。 */
export function netWeight(scale: unknown, clothes: unknown): number | null {
  const scaleValue = parseKg(scale);
  if (scaleValue === null) return null;
  const net = scaleValue - clothesKg(clothes);
  return net >= MIN_VALID_NET_KG ? net : null;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

export type RepresentativeResult = {
  /** 综合代表体重（kg，1 位小数）；无任何有效节点时为 null。 */
  value: number | null;
  /** 参与计算的节点及归一化后的实际权重。 */
  used: { node: WeightNode; ratio: number }[];
  /** 仅中/晚、无早晨记录时为 true，用于「非空腹参考值」提示。 */
  nonFastingOnly: boolean;
};

/**
 * 综合代表体重：基础权重 早60/中20/晚20，缺失节点按剩余权重等比重归一化。
 * 衣物仅扣早晨；中晚输入直接视为裸重。无有效节点返回 value=null。
 */
export function representativeFromNodes(weights: NodeWeights | undefined, clothes: unknown): RepresentativeResult {
  const entries = WEIGHT_NODES.flatMap((meta) => {
    const net = netWeight(weights?.[meta.key], meta.key === "morning" ? clothes : "0");
    return net === null ? [] : [{ node: meta.key, net, base: meta.ratio }];
  });
  if (!entries.length) return { value: null, used: [], nonFastingOnly: false };
  const totalBase = entries.reduce((sum, entry) => sum + entry.base, 0);
  const weighted = entries.reduce((sum, entry) => sum + entry.net * (entry.base / totalBase), 0);
  return {
    value: round1(weighted),
    used: entries.map((entry) => ({ node: entry.node, ratio: Number((entry.base / totalBase).toFixed(3)) })),
    nonFastingOnly: !entries.some((entry) => entry.node === "morning"),
  };
}

/**
 * 统一读取入口：趋势图、海报、CSV、后台统计都用它。
 * weights 存在有效节点时以其为准；否则回退旧字段 weight（旧数据视为早晨、衣物 0）。
 */
export function getRepresentativeWeight(day: WeightReadableDay | undefined): string {
  if (!day) return "";
  const result = representativeFromNodes(day.weights, day.clothes);
  if (result.value !== null) return String(result.value);
  const legacy = parseKg(day.weight);
  return legacy === null ? "" : String(day.weight).trim();
}

/** 有 weights 结构时，保存前重算 weight 派生缓存；无有效节点时保留原 weight。 */
export function deriveWeightCache(day: WeightReadableDay): string {
  const result = representativeFromNodes(day.weights, day.clothes);
  return result.value !== null ? String(result.value) : (day.weight ?? "");
}
