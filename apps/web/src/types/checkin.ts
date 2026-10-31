import type { NodeWeights } from "../utils/weight";

/** storage-v3 单日记录公共类型：展示组件不再依赖打卡页组件。 */
export type DayRecord = {
  weight: string;
  waist: string;
  meals: boolean[];
  water: boolean;
  movement: boolean;
  sleep: boolean;
  weights?: NodeWeights;
  clothes?: string;
};
