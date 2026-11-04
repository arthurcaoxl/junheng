import type { SandboxInput } from '../src/schema';
import { SandboxInputSchema } from '../src/schema';

export const rawSample = {
  version: '7.1',
  horizonMonths: 24,
  product: {
    boxPrice: 660,
    bagsPerBox: 21,
    bagsPerMonth: 30,
    firstPurchaseBoxes: 3,
    boxesPerCase: 24,
    coachPurchasePrice: 462,
    unitCost: 160,
  },
  seed: {
    phase1: { users: 20, weekCompletionRate: 0.8, finalPurchaseRate: 0.75 },
    phase2: { users: 80, checkInCompletionRate: 0.8, finalPurchaseRate: 0.75 },
  },
  users: {
    directNewUsersPerMonth: 10,
    completionRate: 0.8,
    extensionRate: 0.2,
    maintenanceRate: 0.6,
    churnRate: 0.2,
    monthlyRetention: 0.9,
  },
  coaches: {
    initialCandidates: 0,
    initialSupportRecords: 0,
    validRecordRate: 0.9,
    candidateRate: 0.3,
    supportCompletionRate: 0.8,
    requiredRecordedDays: 18,
    supportUsersRequired: 8,
    activeNewPaidUsers: 4,
    monthlyNewUsersPerCoach: 6,
    dataRewardRate: 0.1,
    referralRewardRate: 0.1,
    dataRewardEligibleRate: 1,
    referralRewardEligibleRate: 1,
    rewardOffsetRate: 0.5,
    restockPoint: 12,
  },
  staff: {
    initialCount: 3,
    monthlySalary: 6000,
    autoExpand: true,
    coachesPerStaff: 5,
    usersPerStaff: 150,
  },
  finance: {
    initialCash: 500000,
    rent: 15000,
    monthlyOffice: 8000,
    otherFixedCosts: 0,
    deposit: 30000,
    setupFee: 20000,
    overheadRate: 0.1,
    staffPerformanceRate: 0.1,
    incubationReward: 500,
  },
  scenarios: {
    stress: { multipliers: { completion: 0.8, retention: 0.95, acquisition: 0.8, qualification: 0.8 } },
    upside: { multipliers: { completion: 1.1, retention: 1.05, acquisition: 1.2, qualification: 1.2 } },
  },
} as const;

export function sampleInput(): SandboxInput {
  return SandboxInputSchema.parse(JSON.parse(JSON.stringify(rawSample)));
}
