/** 指标库 2：目标进度率、7 日移动平均线、高情商定性评价。纯函数，无副作用，不触碰 storage-v3。 */

function toFiniteNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round1(value: number): number {
  // 与 BMI 一致：归一化 -0，避免 UI 出现 "-0.0"
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}

/**
 * 目标进度率：(initial - current) / (initial - target)，返回 0–100 的整数。
 * 防御：initial === target（除零）、非有限数、initial/target ≤ 0 均返回 null；
 * 越过目标截断为 100，体重反弹截断为 0。target 由调用方推导（本应用为 BMI 24 健康上限）。
 */
export function calculateTargetProgress(initial: unknown, current: unknown, target: unknown): number | null {
  const init = toFiniteNumber(initial);
  const curr = toFiniteNumber(current);
  const goal = toFiniteNumber(target);
  if (init === null || curr === null || goal === null) return null;
  if (init <= 0 || goal <= 0) return null;
  if (init === goal) return null;
  const progress = ((init - curr) / (init - goal)) * 100;
  if (!Number.isFinite(progress)) return null;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export type WeightPoint = { date: string; weightKg: number };
export type MovingAveragePoint = { date: string; ma7: number };

/**
 * 7 日移动平均线：第 i 点取最近至多 7 个有效点的均值（不足 7 天按可用天数自适应窗口）。
 * 保留 1 位小数；输入空数组返回空数组。
 */
export function calculate7DayMovingAverage(points: readonly WeightPoint[]): MovingAveragePoint[] {
  return points.map((point, index) => {
    const window = points.slice(Math.max(0, index - 6), index + 1);
    const sum = window.reduce((acc, entry) => acc + entry.weightKg, 0);
    return { date: point.date, ma7: round1(sum / window.length) };
  });
}

type FeedbackDay = { weight?: string; waist?: string };

function validDelta(values: number[]): number | null {
  if (values.length < 2) return null;
  return values[values.length - 1] - values[0];
}

/**
 * 高情商定性评价：读取近 7 个打卡日的体重/腰围变化，输出克制、温暖的观察提示。
 * 六大分支：双降→精准掉脂肪 / 体重降腰平 / 体重平腰降 / 双平→平台期 / 体重升→水分安抚 / 偏瘦→营养提醒。
 * 有效体重不足 2 条时返回 null（UI 不渲染）。
 */
export function getSmartFeedback(
  records: Record<string, FeedbackDay>,
  heightCm?: string,
): string | null {
  const days = Object.keys(records).sort().slice(-7).map((date) => records[date]);
  const weights = days.flatMap((day) => {
    const value = toFiniteNumber(day.weight?.trim());
    return value !== null && value > 0 ? [value] : [];
  });
  const waists = days.flatMap((day) => {
    const value = toFiniteNumber(day.waist?.trim());
    return value !== null && value > 0 ? [value] : [];
  });

  const deltaWeight = validDelta(weights);
  if (deltaWeight === null) return null;
  const deltaWaist = validDelta(waists);

  const height = toFiniteNumber(heightCm?.trim());
  if (height !== null && height > 0) {
    const bmi = weights[weights.length - 1] / ((height / 100) ** 2);
    if (bmi < 18.5) {
      return "当前体重偏轻，优先保证营养摄入与力量训练，不必刻意追求体重继续下降。";
    }
  }

  const FLAT = 0.05; // 变化小于 0.05kg/cm 视为持平，过滤测量噪声
  const weightDown = deltaWeight < -FLAT;
  const weightUp = deltaWeight > FLAT;
  const waistDown = deltaWaist !== null && deltaWaist < -FLAT;

  if (weightDown && waistDown) {
    return "近 7 天体重与腰围双双下降，精准掉脂肪。保持当前节奏，身体正在给出正反馈。";
  }
  if (weightDown) {
    return "体重在稳步下降，腰围的变化通常会晚一些到来，继续如实记录就好。";
  }
  if (!weightUp && waistDown) {
    return "体重数字变化不大，但腰围在悄悄收紧，这是身体成分在改善的好信号。";
  }
  if (weightUp) {
    return "体重短期回升多半是水分波动，不代表反弹。继续规律记录，让 7 日均线替你判断方向。";
  }
  return "体重进入短暂的平台期，这是身体在适应，并不代表努力失效，坚持记录就会看到下一次变化。";
}
