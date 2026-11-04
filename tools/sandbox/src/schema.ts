import { z } from 'zod';

const ratio = (label: string) => z.number().min(0, `${label}不能小于 0`).max(1, `${label}不能大于 1`);
const positive = (label: string) => z.number().positive(`${label}必须大于 0`);
const nonNegative = (label: string) => z.number().min(0, `${label}不能为负数`);
const nonNegativeInt = (label: string) => z.number().int(`${label}必须是整数`).min(0, `${label}不能为负数`);
const multipliers = z.object({
  completion: nonNegative('完赛系数'),
  retention: nonNegative('留存系数'),
  acquisition: nonNegative('新拓系数'),
  qualification: nonNegative('资格转化系数'),
}).strict();

export const SandboxInputSchema = z.object({
  version: z.literal('7.1'),
  horizonMonths: z.number().int('推演月数必须是整数').positive('推演月数必须大于 0'),
  product: z.object({
    boxPrice: positive('盒价'), bagsPerBox: positive('每盒袋数'), bagsPerMonth: positive('每月袋数'),
    firstPurchaseBoxes: positive('首购盒数'), boxesPerCase: positive('每箱盒数'),
    coachPurchasePrice: positive('教练拿货价'), unitCost: positive('产品成本'),
  }).strict(),
  seed: z.object({
    phase1: z.object({ users: nonNegativeInt('种子 1 期人数'), weekCompletionRate: ratio('一周通过率'), finalPurchaseRate: ratio('第 3 盒购买率') }).strict(),
    phase2: z.object({ users: nonNegativeInt('种子 2 期人数'), checkInCompletionRate: ratio('打卡通过率'), finalPurchaseRate: ratio('第 3 盒购买率') }).strict(),
  }).strict(),
  users: z.object({
    directNewUsersPerMonth: nonNegative('直营月新增用户'), completionRate: ratio('首购完赛率'),
    extensionRate: ratio('延伸分流率'), maintenanceRate: ratio('维持分流率'), churnRate: ratio('流失率'),
    monthlyRetention: ratio('月度维持留存率'),
  }).strict(),
  coaches: z.object({
    initialCandidates: nonNegative('初始候选数'), initialSupportRecords: nonNegative('初始扶持记录'),
    validRecordRate: ratio('有效打卡率'), candidateRate: ratio('教练候选率'), supportCompletionRate: ratio('扶持完赛率'),
    requiredRecordedDays: z.number().int().min(0).max(21), supportUsersRequired: positive('每名教练扶持人数'),
    activeNewPaidUsers: positive('活跃新客边界'), monthlyNewUsersPerCoach: nonNegative('教练月新拓'),
    dataRewardRate: ratio('数据奖励率'), referralRewardRate: ratio('裂变奖励率'),
    dataRewardEligibleRate: ratio('数据奖励达标率'), referralRewardEligibleRate: ratio('裂变奖励达标率'),
    rewardOffsetRate: ratio('奖励抵扣比例'), restockPoint: nonNegative('补货点'),
  }).strict(),
  staff: z.object({
    initialCount: z.number().int('员工数必须是整数').min(1, '员工数至少为 1'), monthlySalary: nonNegative('员工底薪'),
    autoExpand: z.boolean(), coachesPerStaff: positive('每员工教练容量'), usersPerStaff: positive('每员工用户容量'),
  }).strict(),
  finance: z.object({
    initialCash: nonNegative('初始现金'), rent: nonNegative('房租'), monthlyOffice: nonNegative('月度办公'),
    otherFixedCosts: nonNegative('其他固定成本'), deposit: nonNegative('押金'), setupFee: nonNegative('开办费'),
    overheadRate: ratio('动态平摊率'), staffPerformanceRate: ratio('员工绩效率'), incubationReward: nonNegative('孵化奖'),
  }).strict(),
  scenarios: z.object({
    stress: z.object({ multipliers }).strict(), upside: z.object({ multipliers }).strict(),
  }).strict(),
}).strict().superRefine((input, ctx) => {
  const sum = input.users.extensionRate + input.users.maintenanceRate + input.users.churnRate;
  if (Math.abs(sum - 1) > 1e-9) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['users'], message: '延伸、维持和流失分流之和必须等于 1' });
});

export type SandboxInput = z.infer<typeof SandboxInputSchema>;
export type ProductInput = SandboxInput['product'];
export type CoachPolicyInput = SandboxInput['coaches'];
export type ScenarioKey = 'baseline' | 'stress' | 'upside';
