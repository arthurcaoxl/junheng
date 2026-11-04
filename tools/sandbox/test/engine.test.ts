import { describe, expect, it } from 'vitest';
import { applyQualification, calculateStaffCapacity, emptyUserChannel, isCoachCohortActive, runSeedMonth, simulate, simulateUserMonth, resolveUserRates } from '../src/engine';
import { sampleInput } from './fixtures';

describe('用户月度 cohort', () => {
  it('维持需求按 30/21 盒，存量维持优先于延伸与新客', () => {
    const input = sampleInput();
    const state = { maintenanceUsers: 21, extensionUsers: 2 };
    const result = simulateUserMonth(state, 4, 40, input.product, resolveUserRates(input, 'baseline'));
    expect(result.record.maintenanceBoxes).toBe(30);
    expect(result.record.extensionBoxes).toBe(6);
    expect(result.record.firstPurchaseBoxes).toBe(4);
    expect(result.record.actualFirstPurchaseUsers).toBeCloseTo(4 / 3, 8);
    expect(result.record.shortageBoxes).toBe(8);
    expect(result.state.maintenanceUsers).toBeGreaterThan(0);
  });

  it('完赛分流闭合，下一月维持池为留存存量加新增维持', () => {
    const input = sampleInput();
    const result = simulateUserMonth(emptyUserChannel(), 10, Infinity, input.product, resolveUserRates(input, 'baseline'));
    expect(result.record.completedUsers).toBe(8);
    expect(result.record.nextExtensionUsers).toBeCloseTo(1.6, 8);
    expect(result.record.nextMaintenanceUsers).toBeCloseTo(4.8, 8);
    expect(result.record.churnedUsers).toBeCloseTo(1.6, 8);
    expect(result.state.extensionUsers).toBeCloseTo(1.6, 8);
    expect(result.state.maintenanceUsers).toBeCloseTo(4.8, 8);
  });
});

describe('两期种子付费与免费盒门禁', () => {
  it('种子 1 期前两盒免费，只有通过前序门禁者购买第 3 盒并完赛', () => {
    const input = sampleInput();
    const seed = runSeedMonth(input, 1);
    expect(seed.freeBoxes).toBe(36);
    expect(seed.paidBoxes).toBe(12);
    expect(seed.completedUsers).toBe(12);
  });

  it('种子 2 期第 1、3 盒付费，第 2 盒免费，未通过者无后续记录', () => {
    const input = sampleInput();
    const seed = runSeedMonth(input, 2);
    expect(seed.freeBoxes).toBe(64);
    expect(seed.paidBoxes).toBe(128);
    expect(seed.completedUsers).toBe(48);
  });
});

describe('教练资格与活跃规则', () => {
  it('每 8 名其他扶持完赛用户至多准入 1 名教练，余量跨月保留', () => {
    const input = sampleInput();
    const result = applyQualification(
      { candidates: 0, supportRecords: 0 }, 100, input.coaches, 1,
    );
    expect(result.newCandidates).toBe(27);
    expect(result.newSupportRecords).toBeCloseTo(58.4, 8);
    expect(result.admitted).toBe(7);
    expect(result.state.candidates).toBe(20);
    expect(result.state.supportRecords).toBeCloseTo(2.4, 8);
  });

  it('候选或扶持记录不足时不生成正式教练', () => {
    const input = sampleInput();
    expect(applyQualification({ candidates: 0, supportRecords: 0 }, 0, input.coaches, 1).admitted).toBe(0);
    expect(applyQualification({ candidates: 2, supportRecords: 7 }, 0, input.coaches, 1).admitted).toBe(0);
  });

  it('高资格系数只放大候选且不超过完赛者，扶持记录仍由基准候选守恒', () => {
    const input = sampleInput();
    const result = applyQualification({ candidates: 0, supportRecords: 0 }, 100, input.coaches, 10);
    expect(result.newCandidates).toBe(100);
    expect(result.newSupportRecords).toBeCloseTo(58.4, 8);
  });

  it('零资格系数保留既有候选准入，扶持记录不受场景系数影响', () => {
    const input = sampleInput();
    const result = applyQualification({ candidates: 2, supportRecords: 16 }, 100, input.coaches, 0);
    expect(result.newCandidates).toBe(0);
    expect(result.newSupportRecords).toBeCloseTo(58.4, 8);
    expect(result.admitted).toBe(2);
    expect(result.state.candidates).toBe(0);
    expect(result.state.supportRecords).toBeCloseTo(58.4, 8);
  });

  it('候选与扶持余量连续两个月结转后再准入', () => {
    const input = sampleInput();
    const first = applyQualification({ candidates: 0, supportRecords: 0 }, 10, input.coaches, 1);
    expect(first.newCandidates).toBeCloseTo(2.7, 8);
    expect(first.newSupportRecords).toBeCloseTo(5.84, 8);
    expect(first.admitted).toBe(0);
    const second = applyQualification(first.state, 10, input.coaches, 1);
    expect(second.admitted).toBe(1);
    expect(second.state.candidates).toBeCloseTo(4.4, 8);
    expect(second.state.supportRecords).toBeCloseTo(3.68, 8);
  });

  it('零候选率只形成扶持记录，不凭空产生教练', () => {
    const input = sampleInput();
    input.coaches.candidateRate = 0;
    const result = applyQualification({ candidates: 0, supportRecords: 16 }, 100, input.coaches, 10);
    expect(result.newCandidates).toBe(0);
    expect(result.newSupportRecords).toBe(80);
    expect(result.admitted).toBe(0);
    expect(result.state.supportRecords).toBe(96);
  });

  it('零候选且零教练时全月结果保持零值和有限容量', () => {
    const input = sampleInput();
    input.horizonMonths = 2;
    input.seed.phase1.users = 0;
    input.seed.phase2.users = 0;
    input.users.directNewUsersPerMonth = 0;
    input.coaches.initialCandidates = 0;
    input.coaches.initialSupportRecords = 0;
    input.coaches.monthlyNewUsersPerCoach = 0;
    const result = simulate(input);
    for (const month of result.months) {
      expect(month.servedCoaches).toBe(0);
      expect(month.newCandidates).toBe(0);
      expect(month.admittedCoaches).toBe(0);
      expect(month.coachMonths).toHaveLength(0);
      expect(Number.isFinite(month.capacityUtilization)).toBe(true);
    }
  });

  it('第 4 名实际新增付费用户是边界，低于 4 休眠且不按收入腰斩', () => {
    expect(isCoachCohortActive(8, 2, 4)).toBe(true);
    expect(isCoachCohortActive(7.99, 2, 4)).toBe(false);
  });
});

function coachedInput() {
  const input = sampleInput();
  input.seed.phase1.users = 0;
  input.seed.phase2.users = 0;
  input.coaches.initialCandidates = 1;
  input.coaches.initialSupportRecords = 8;
  input.coaches.candidateRate = 0;
  input.coaches.supportCompletionRate = 0;
  input.coaches.monthlyNewUsersPerCoach = 1;
  input.staff.autoExpand = false;
  return input;
}

describe('月度经营状态机', () => {
  it('资格月末审核、次月准入并首箱到库；现金与确认收入分列', () => {
    const flow = simulate(coachedInput()).months;
    expect(flow[0].admittedCoaches).toBe(1);
    expect(flow[0].activeCoaches).toBe(0);
    expect(flow[1].activeCoaches).toBe(1);
    expect(flow[1].firstCaseBoxes).toBe(24);
    expect(flow[1].coachOrderRevenue).toBe(11088);
    expect(flow[1].cashInflow).toBe(11088 + flow[1].directRevenue);
  });

  it('每教练新客低于 4 时月末休眠，次月托管且滞留库存不回购', () => {
    const flow = simulate(coachedInput()).months;
    expect(flow[1].dormantCoaches).toBe(1);
    expect(flow[1].coachInventory).toBe(21);
    expect(flow[2].custodiedUsers).toBeGreaterThan(0);
    expect(flow[2].dormantInventory).toBe(21);
    expect(flow[2].coachOrderBoxes).toBe(0);
    expect(flow[2].activeCoaches).toBe(0);
  });

  it('休眠当月仍计入服务教练与容量，托管从次月开始', () => {
    const input = coachedInput();
    input.staff.initialCount = 1;
    input.staff.coachesPerStaff = 1;
    input.staff.usersPerStaff = 1;
    const flow = simulate(input).months;
    const month = flow[1];
    expect(month.activeCoaches).toBe(1);
    expect(month.servedCoaches).toBe(1);
    expect(month.endingActiveCoaches).toBe(0);
    expect(month.newlyDormantCoaches).toBe(1);

    const directUsers = month.direct.endingMaintenanceUsers + month.direct.nextExtensionUsers;
    const coachUsers = month.coachMonths.reduce(
      (total, coach) => total + coach.users.endingMaintenanceUsers + coach.users.nextExtensionUsers,
      0,
    );
    expect(coachUsers).toBeGreaterThan(0);
    expect(month.managedUsers).toBeCloseTo(directUsers + coachUsers, 8);
    expect(month.capacityUtilization).toBeCloseTo(Math.max(month.servedCoaches, directUsers + coachUsers), 8);
    expect(flow[2].custodiedUsers).toBeGreaterThan(0);
    expect(flow[2].servedCoaches).toBe(0);
  });

  it('库存不足限制成交并记录缺货，不产生负库存', () => {
    const input = coachedInput();
    input.coaches.monthlyNewUsersPerCoach = 20;
    const flow = simulate(input).months;
    const month = flow[1];
    expect(month.coachSoldBoxes).toBeLessThanOrEqual(24);
    expect(month.shortageBoxes).toBeGreaterThan(0);
    expect(month.coachInventory).toBeGreaterThanOrEqual(0);
  });

  it('后续拿货使用奖励余额，现金减少但不重复冲减收入或费用', () => {
    const input = coachedInput();
    input.coaches.monthlyNewUsersPerCoach = 6;
    const flow = simulate(input).months;
    expect(flow[1].rewardOffsetAccrued).toBeCloseTo(18 * 132 * 0.5, 8);
    expect(flow[2].rewardOffsetUsed).toBeCloseTo(flow[1].rewardOffsetAccrued, 8);
    expect(flow[2].coachOrderRevenue).toBe(11088);
    expect(flow[2].cashInflow).toBeCloseTo(11088 - flow[2].rewardOffsetUsed + flow[2].directRevenue, 8);
  });

  it('每月现金恒等式成立，押金与开办费只在首月扣除', () => {
    const input = coachedInput();
    const withoutOneTime = coachedInput();
    withoutOneTime.finance.deposit = 0;
    withoutOneTime.finance.setupFee = 0;
    const flow = simulate(input).months;
    const comparison = simulate(withoutOneTime).months;
    let previousCash = input.finance.initialCash;
    for (const month of flow) {
      expect(month.netCashFlow).toBeCloseTo(month.cashInflow - month.cashOutflow, 6);
      expect(month.cashBalance).toBeCloseTo(previousCash + month.netCashFlow, 6);
      previousCash = month.cashBalance;
    }
    expect(flow[0].cashOutflow - comparison[0].cashOutflow).toBe(50000);
    for (let i = 1; i < flow.length; i++) {
      expect(flow[i].cashOutflow).toBeCloseTo(comparison[i].cashOutflow, 8);
    }
  });

  it('默认样本 24 个月推演无浮点负库存', () => {
    const input = sampleInput();
    expect(() => simulate(input)).not.toThrow();
    const result = simulate(input);
    for (const cohort of result.finalState.cohorts) {
      expect(cohort.inventory).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('员工容量', () => {
  it('建议员工数取教练和用户两项需求的较大值', () => {
    const input = sampleInput();
    expect(calculateStaffCapacity(2, 12, 200, input)).toEqual({
      coachCapacity: 10, userCapacity: 300, capacityUtilization: 1.2,
      suggestedStaffCount: 3, staffExpansionGap: 1, capacityWarning: true,
    });
    expect(calculateStaffCapacity(3, 12, 200, input).capacityWarning).toBe(false);
  });

  it('关闭扩编只预警，开启扩编在次月生效且不回改留存', () => {
    const offInput = sampleInput();
    offInput.seed.phase1.users = 0;
    offInput.seed.phase2.users = 0;
    offInput.users.directNewUsersPerMonth = 10;
    offInput.coaches.initialCandidates = 6;
    offInput.coaches.initialSupportRecords = 48;
    offInput.coaches.candidateRate = 0;
    offInput.coaches.supportCompletionRate = 0;
    offInput.staff.initialCount = 1;
    offInput.staff.autoExpand = false;
    const off = simulate(offInput).months;
    expect(off[1].activeCoaches).toBe(6);
    expect(off[1].suggestedStaffCount).toBe(2);
    expect(off[2].staffCount).toBe(1);
    expect(off[1].capacityWarning).toBe(true);

    const onInput = sampleInput();
    onInput.seed.phase1.users = 0;
    onInput.seed.phase2.users = 0;
    onInput.users.directNewUsersPerMonth = 10;
    onInput.coaches.initialCandidates = 6;
    onInput.coaches.initialSupportRecords = 48;
    onInput.coaches.candidateRate = 0;
    onInput.coaches.supportCompletionRate = 0;
    onInput.staff.initialCount = 1;
    onInput.staff.autoExpand = true;
    const on = simulate(onInput).months;
    expect(on[1].suggestedStaffCount).toBe(2);
    expect(on[2].staffCount).toBe(2);
    expect(on[0].direct.endingMaintenanceUsers).toBe(off[0].direct.endingMaintenanceUsers);
  });
});

describe('审查补充回归', () => {
  it('非默认产品袋数与首购盒数传导到实际月度需求', () => {
    const input = sampleInput();
    input.product.bagsPerMonth = 60;
    input.product.bagsPerBox = 20;
    input.product.firstPurchaseBoxes = 2;
    const result = simulateUserMonth(
      { maintenanceUsers: 2, extensionUsers: 1 }, 3, Infinity,
      input.product, resolveUserRates(input, 'baseline'),
    );
    expect(result.record.maintenanceBoxes).toBe(6);
    expect(result.record.extensionBoxes).toBe(2);
    expect(result.record.firstPurchaseBoxes).toBe(6);
    expect(result.record.soldBoxes).toBe(14);
  });

  it('库存浮点容差只 canonicalize 近零值且库存月聚合精确为零', () => {
    const result = simulate(sampleInput());
    expect(result.months[0].coachInventory).toBe(0);
    for (const cohort of result.finalState.cohorts) {
      expect(cohort.inventory === 0 || Math.abs(cohort.inventory) >= 1e-9).toBe(true);
      expect(cohort.inventory).toBeGreaterThanOrEqual(0);
    }
  });

  it('自动扩编后所有月份的直营与教练留存队列均保持隔离', () => {
    const makeInput = (autoExpand: boolean) => {
      const input = sampleInput();
      input.seed.phase1.users = 0;
      input.seed.phase2.users = 0;
      input.coaches.initialCandidates = 6;
      input.coaches.initialSupportRecords = 48;
      input.coaches.candidateRate = 0;
      input.coaches.supportCompletionRate = 0;
      input.staff.initialCount = 1;
      input.staff.autoExpand = autoExpand;
      return input;
    };
    const off = simulate(makeInput(false)).months;
    const on = simulate(makeInput(true)).months;
    for (let i = 0; i < off.length; i++) {
      expect(on[i].direct.endingMaintenanceUsers).toBe(off[i].direct.endingMaintenanceUsers);
      expect(on[i].direct.nextExtensionUsers).toBe(off[i].direct.nextExtensionUsers);
      expect(on[i].coachMonths).toHaveLength(off[i].coachMonths.length);
      for (let j = 0; j < off[i].coachMonths.length; j++) {
        expect(on[i].coachMonths[j].users.endingMaintenanceUsers).toBe(off[i].coachMonths[j].users.endingMaintenanceUsers);
        expect(on[i].coachMonths[j].users.nextExtensionUsers).toBe(off[i].coachMonths[j].users.nextExtensionUsers);
      }
    }
  });
});
