import { monthlyRecurringBoxes, settleCoachOrder, settleCoachRewards } from './economics';
import type { CoachPolicyInput, ProductInput, SandboxInput, ScenarioKey } from './schema';

export interface UserChannelState { maintenanceUsers: number; extensionUsers: number; }
export interface UserRates { completionRate: number; extensionRate: number; maintenanceRate: number; churnRate: number; monthlyRetention: number; }
export interface ScenarioMultipliers { completion: number; retention: number; acquisition: number; qualification: number; }
export interface UserMonthRecord {
  newFirstPurchaseUsers: number; actualFirstPurchaseUsers: number; extensionUsers: number;
  maintenanceUsers: number; completedUsers: number; nextExtensionUsers: number;
  nextMaintenanceUsers: number; churnedUsers: number; firstPurchaseBoxes: number;
  extensionBoxes: number; maintenanceBoxes: number; soldBoxes: number; shortageBoxes: number;
  endingMaintenanceUsers: number;
}
export interface UserMonthResult { state: UserChannelState; record: UserMonthRecord; }
export interface SeedResult { paidUsers: number; paidBoxes: number; freeBoxes: number; completedUsers: number; }
export interface CompleterOutcomes { extensionUsers: number; maintenanceUsers: number; churnedUsers: number; }

export function emptyUserChannel(): UserChannelState { return { maintenanceUsers: 0, extensionUsers: 0 }; }
export function clampRatio(value: number): number { return Math.max(0, Math.min(1, value)); }

export function scenarioMultipliers(input: SandboxInput, scenario: ScenarioKey): ScenarioMultipliers {
  if (scenario === 'baseline') return { completion: 1, retention: 1, acquisition: 1, qualification: 1 };
  return input.scenarios[scenario].multipliers;
}

export function resolveUserRates(input: SandboxInput, scenario: ScenarioKey): UserRates {
  const m = scenarioMultipliers(input, scenario);
  return {
    completionRate: clampRatio(input.users.completionRate * m.completion),
    extensionRate: input.users.extensionRate,
    maintenanceRate: input.users.maintenanceRate,
    churnRate: input.users.churnRate,
    monthlyRetention: clampRatio(input.users.monthlyRetention * m.retention),
  };
}

export function splitCompleters(completers: number, rates: UserRates): CompleterOutcomes {
  return {
    extensionUsers: completers * rates.extensionRate,
    maintenanceUsers: completers * rates.maintenanceRate,
    churnedUsers: completers * rates.churnRate,
  };
}

export function addCompleterOutcomes(state: UserChannelState, completers: number, rates: UserRates): CompleterOutcomes {
  const outcome = splitCompleters(completers, rates);
  state.extensionUsers += outcome.extensionUsers;
  state.maintenanceUsers += outcome.maintenanceUsers;
  return outcome;
}

export function simulateUserMonth(
  state: UserChannelState,
  newFirstPurchaseUsers: number,
  availableBoxes: number,
  product: ProductInput,
  rates: UserRates,
): UserMonthResult {
  const recurring = monthlyRecurringBoxes(product);
  const maintenanceDemand = state.maintenanceUsers * recurring;
  const extensionDemand = state.extensionUsers * product.firstPurchaseBoxes;
  const firstDemand = newFirstPurchaseUsers * product.firstPurchaseBoxes;
  const maintenanceBoxes = Math.min(maintenanceDemand, availableBoxes);
  const afterMaintenance = availableBoxes - maintenanceBoxes;
  const extensionBoxes = Math.min(extensionDemand, afterMaintenance);
  const afterExtension = afterMaintenance - extensionBoxes;
  const firstPurchaseBoxes = Math.min(firstDemand, afterExtension);
  const actualFirst = firstPurchaseBoxes / product.firstPurchaseBoxes;
  const actualExtension = extensionBoxes / product.firstPurchaseBoxes;
  const completed = (actualFirst + actualExtension) * rates.completionRate;
  const outcome = splitCompleters(completed, rates);
  const sold = maintenanceBoxes + extensionBoxes + firstPurchaseBoxes;
  const demand = maintenanceDemand + extensionDemand + firstDemand;
  const nextState = {
    maintenanceUsers: state.maintenanceUsers * rates.monthlyRetention + outcome.maintenanceUsers,
    extensionUsers: outcome.extensionUsers,
  };
  return {
    state: nextState,
    record: {
      newFirstPurchaseUsers, actualFirstPurchaseUsers: actualFirst,
      extensionUsers: state.extensionUsers, maintenanceUsers: state.maintenanceUsers,
      completedUsers: completed, nextExtensionUsers: outcome.extensionUsers,
      nextMaintenanceUsers: outcome.maintenanceUsers, churnedUsers: outcome.churnedUsers,
      firstPurchaseBoxes, extensionBoxes, maintenanceBoxes, soldBoxes: sold,
      shortageBoxes: demand - sold, endingMaintenanceUsers: nextState.maintenanceUsers,
    },
  };
}

export function runSeedMonth(input: SandboxInput, month: number): SeedResult {
  if (month === 1) {
    const p = input.seed.phase1;
    const passed = p.users * p.weekCompletionRate;
    const paidUsers = passed * p.finalPurchaseRate;
    return { paidUsers, paidBoxes: paidUsers, freeBoxes: p.users + passed, completedUsers: paidUsers };
  }
  if (month === 2) {
    const p = input.seed.phase2;
    const passed = p.users * p.checkInCompletionRate;
    const finalUsers = passed * p.finalPurchaseRate;
    return { paidUsers: p.users + finalUsers, paidBoxes: p.users + finalUsers, freeBoxes: passed, completedUsers: finalUsers };
  }
  return { paidUsers: 0, paidBoxes: 0, freeBoxes: 0, completedUsers: 0 };
}

export interface QualificationState { candidates: number; supportRecords: number; }
export interface QualificationResult {
  state: QualificationState; newCandidates: number; newSupportRecords: number; admitted: number;
}

export function applyQualification(
  previous: QualificationState,
  validCompleters: number,
  policy: CoachPolicyInput,
  qualificationMultiplier: number,
): QualificationResult {
  const baseCandidates = validCompleters * policy.validRecordRate * policy.candidateRate;
  const newSupportRecords = Math.max(0, validCompleters - baseCandidates) * policy.supportCompletionRate;
  const newCandidates = Math.min(validCompleters, baseCandidates * qualificationMultiplier);
  const availableCandidates = previous.candidates + newCandidates;
  const availableSupport = previous.supportRecords + newSupportRecords;
  const admitted = Math.min(availableCandidates, Math.floor(availableSupport / policy.supportUsersRequired));
  return {
    newCandidates,
    newSupportRecords,
    admitted,
    state: {
      candidates: availableCandidates - admitted,
      supportRecords: availableSupport - admitted * policy.supportUsersRequired,
    },
  };
}

export function isCoachCohortActive(actualNewPaidUsers: number, coaches: number, threshold: number): boolean {
  return coaches > 0 && actualNewPaidUsers / coaches >= threshold;
}

export interface CoachCohortState {
  id: number; coaches: number; active: boolean; custodied: boolean; newlyActive: boolean;
  inventory: number; rewardBalance: number; users: UserChannelState;
}

export interface CoachMonthResult {
  cohortId: number; coaches: number; orderedBoxes: number; firstCaseBoxes: number;
  coachOrderRevenue: number; cashOrderPayment: number; rewardOffsetUsed: number;
  soldBoxes: number; shortageBoxes: number; inventory: number; active: boolean;
  actualNewPaidUsers: number; dataReward: number; referralReward: number;
  rewardOffsetAccrued: number; rewardCash: number; rewardBalance: number;
  coachEarnings: number; users: UserMonthRecord;
}

export interface StaffCapacity {
  coachCapacity: number; userCapacity: number; capacityUtilization: number;
  suggestedStaffCount: number; staffExpansionGap: number; capacityWarning: boolean;
}

export function calculateStaffCapacity(
  staffCount: number,
  activeCoaches: number,
  managedUsers: number,
  input: SandboxInput,
): StaffCapacity {
  const coachCapacity = staffCount * input.staff.coachesPerStaff;
  const userCapacity = staffCount * input.staff.usersPerStaff;
  const suggestedStaffCount = Math.max(
    1,
    Math.ceil(activeCoaches / input.staff.coachesPerStaff),
    Math.ceil(managedUsers / input.staff.usersPerStaff),
  );
  return {
    coachCapacity,
    userCapacity,
    capacityUtilization: Math.max(
      coachCapacity > 0 ? activeCoaches / coachCapacity : 0,
      userCapacity > 0 ? managedUsers / userCapacity : 0,
    ),
    suggestedStaffCount,
    staffExpansionGap: Math.max(0, suggestedStaffCount - staffCount),
    capacityWarning: suggestedStaffCount > staffCount,
  };
}

export interface MonthResult {
  month: number; cashBalance: number; cumulativeCashFlow: number;
  cashInflow: number; cashOutflow: number; netCashFlow: number;
  confirmedRevenue: number; directRevenue: number; coachOrderRevenue: number;
  terminalGMV: number; operatingContribution: number; operatingNet: number;
  productCost: number; overhead: number; fixedCosts: number;
  staffBaseSalary: number; staffPerformance: number; incubationReward: number;
  dataRewards: number; referralRewards: number; rewardCash: number;
  rewardOffsetUsed: number; rewardOffsetAccrued: number; rewardLiability: number;
  coachEarnings: number; coachOrderBoxes: number; firstCaseBoxes: number;
  coachSoldBoxes: number; directPaidBoxes: number; directFreeBoxes: number;
  coachInventory: number; dormantInventory: number; shortageBoxes: number;
  /** 当月实际服务的教练数，包含月末新休眠教练。 */
  servedCoaches: number;
  /** 月末仍活跃的教练数。 */
  endingActiveCoaches: number;
  /** 当月服务但月末新转为休眠的教练数，次月才开始托管。 */
  newlyDormantCoaches: number;
  /** 兼容字段：servedCoaches 的别名。 */
  activeCoaches: number;
  /** 兼容字段：newlyDormantCoaches 的别名。 */
  dormantCoaches: number;
  admittedCoaches: number;
  newCandidates: number; newSupportRecords: number; custodiedUsers: number;
  completedUsers: number; managedUsers: number; staffCount: number;
  coachCapacity: number; userCapacity: number; capacityUtilization: number;
  suggestedStaffCount: number; staffExpansionGap: number; capacityWarning: boolean;
  direct: UserMonthRecord; coachMonths: CoachMonthResult[];
}

export interface EngineState {
  direct: UserChannelState; cohorts: CoachCohortState[]; qualification: QualificationState;
  pendingAdmissions: number; cash: number; cumulativeCashFlow: number;
  staffCount: number; nextCohortId: number;
}
export interface SimulationResult { months: MonthResult[]; finalState: EngineState; }

export function simulate(input: SandboxInput, scenario: ScenarioKey = 'baseline'): SimulationResult {
  const rates = resolveUserRates(input, scenario);
  const multipliers = scenarioMultipliers(input, scenario);
  const state: EngineState = {
    direct: emptyUserChannel(), cohorts: [],
    qualification: {
      candidates: input.coaches.initialCandidates,
      supportRecords: input.coaches.initialSupportRecords,
    },
    pendingAdmissions: 0, cash: input.finance.initialCash, cumulativeCashFlow: 0,
    staffCount: input.staff.initialCount, nextCohortId: 1,
  };
  const months: MonthResult[] = [];

  for (let month = 1; month <= input.horizonMonths; month++) {
    let custodiedUsers = 0;
    for (const cohort of state.cohorts) {
      if (!cohort.active && !cohort.custodied) {
        custodiedUsers += cohort.users.maintenanceUsers + cohort.users.extensionUsers;
        state.direct.maintenanceUsers += cohort.users.maintenanceUsers;
        state.direct.extensionUsers += cohort.users.extensionUsers;
        cohort.users = emptyUserChannel();
        cohort.custodied = true;
      }
    }

    if (state.pendingAdmissions > 0) {
      state.cohorts.push({
        id: state.nextCohortId++, coaches: state.pendingAdmissions,
        active: true, custodied: false, newlyActive: true,
        inventory: 0, rewardBalance: 0, users: emptyUserChannel(),
      });
      state.pendingAdmissions = 0;
    }

    const seed = runSeedMonth(input, month);
    const directResult = simulateUserMonth(
      state.direct,
      input.users.directNewUsersPerMonth * multipliers.acquisition,
      Infinity,
      input.product,
      rates,
    );
    state.direct = directResult.state;
    const seedOutcome = addCompleterOutcomes(state.direct, seed.completedUsers, rates);
    directResult.record.completedUsers += seed.completedUsers;
    directResult.record.nextExtensionUsers += seedOutcome.extensionUsers;
    directResult.record.nextMaintenanceUsers += seedOutcome.maintenanceUsers;
    directResult.record.churnedUsers += seedOutcome.churnedUsers;
    directResult.record.endingMaintenanceUsers = state.direct.maintenanceUsers;

    const coachMonths: CoachMonthResult[] = [];
    let dormantCoaches = 0;
    for (const cohort of state.cohorts) {
      if (!cohort.active) continue;
      const order = settleCoachOrder(
        cohort.coaches, cohort.inventory, cohort.newlyActive,
        cohort.rewardBalance, input.product, input.coaches,
      );
      cohort.newlyActive = false;
      const userResult = simulateUserMonth(
        cohort.users,
        cohort.coaches * input.coaches.monthlyNewUsersPerCoach * multipliers.acquisition,
        order.inventoryAfterOrder,
        input.product,
        rates,
      );
      const reward = settleCoachRewards(
        userResult.record.soldBoxes, order.rewardBalanceAfterOrder,
        input.product, input.coaches,
      );
      cohort.users = userResult.state;
      const inventoryAfterSales = order.inventoryAfterOrder - userResult.record.soldBoxes;
      cohort.inventory = Math.abs(inventoryAfterSales) < 1e-9 ? 0 : inventoryAfterSales;
      cohort.rewardBalance = reward.rewardBalanceAfterSale;
      cohort.active = isCoachCohortActive(
        userResult.record.actualFirstPurchaseUsers,
        cohort.coaches,
        input.coaches.activeNewPaidUsers,
      );
      if (!cohort.active) dormantCoaches += cohort.coaches;
      coachMonths.push({
        cohortId: cohort.id, coaches: cohort.coaches,
        orderedBoxes: order.orderedBoxes, firstCaseBoxes: order.firstCaseBoxes,
        coachOrderRevenue: order.standardPayment, cashOrderPayment: order.cashPayment,
        rewardOffsetUsed: order.rewardOffsetUsed, soldBoxes: userResult.record.soldBoxes,
        shortageBoxes: userResult.record.shortageBoxes, inventory: cohort.inventory,
        active: cohort.active, actualNewPaidUsers: userResult.record.actualFirstPurchaseUsers,
        dataReward: reward.dataReward, referralReward: reward.referralReward,
        rewardOffsetAccrued: reward.rewardOffsetAccrued, rewardCash: reward.rewardCash,
        rewardBalance: cohort.rewardBalance, coachEarnings: reward.coachEarnings,
        users: userResult.record,
      });
    }

    let completedUsers = directResult.record.completedUsers;
    for (const coach of coachMonths) completedUsers += coach.users.completedUsers;
    const qualification = applyQualification(
      state.qualification, completedUsers, input.coaches, multipliers.qualification,
    );
    state.qualification = qualification.state;
    state.pendingAdmissions = qualification.admitted;

    let coachOrderBoxes = 0, firstCaseBoxes = 0, coachOrderRevenue = 0;
    let coachCashOrders = 0, rewardOffsetUsed = 0, coachSoldBoxes = 0;
    let dataRewards = 0, referralRewards = 0, rewardCash = 0;
    let rewardOffsetAccrued = 0, coachEarnings = 0, shortageBoxes = directResult.record.shortageBoxes;
    for (const coach of coachMonths) {
      coachOrderBoxes += coach.orderedBoxes;
      firstCaseBoxes += coach.firstCaseBoxes;
      coachOrderRevenue += coach.coachOrderRevenue;
      coachCashOrders += coach.cashOrderPayment;
      rewardOffsetUsed += coach.rewardOffsetUsed;
      coachSoldBoxes += coach.soldBoxes;
      dataRewards += coach.dataReward;
      referralRewards += coach.referralReward;
      rewardCash += coach.rewardCash;
      rewardOffsetAccrued += coach.rewardOffsetAccrued;
      coachEarnings += coach.coachEarnings;
      shortageBoxes += coach.shortageBoxes;
    }

    let servedCoaches = 0, endingActiveCoaches = 0;
    let coachInventory = 0, dormantInventory = 0, rewardLiability = 0;
    for (const coach of coachMonths) {
      servedCoaches += coach.coaches;
      if (coach.active) endingActiveCoaches += coach.coaches;
    }
    let managedUsers = state.direct.maintenanceUsers + state.direct.extensionUsers;
    for (const cohort of state.cohorts) {
      coachInventory += cohort.inventory;
      rewardLiability += cohort.rewardBalance;
      managedUsers += cohort.users.maintenanceUsers + cohort.users.extensionUsers;
      if (!cohort.active) dormantInventory += cohort.inventory;
    }

    const directPaidBoxes = directResult.record.soldBoxes + seed.paidBoxes;
    const directRevenue = directPaidBoxes * input.product.boxPrice;
    const confirmedRevenue = coachOrderRevenue + directRevenue;
    const terminalGMV = (coachSoldBoxes + directPaidBoxes) * input.product.boxPrice;
    const productCost = (coachOrderBoxes + directPaidBoxes + seed.freeBoxes) * input.product.unitCost;
    const coachOrderGross = coachOrderBoxes * (input.product.coachPurchasePrice - input.product.unitCost);
    const directGross = directRevenue - (directPaidBoxes + seed.freeBoxes) * input.product.unitCost;
    const operatingContribution = coachOrderGross + directGross - dataRewards - referralRewards;
    const overhead = terminalGMV * input.finance.overheadRate;
    const staffBaseSalary = state.staffCount * input.staff.monthlySalary;
    const staffPerformance = coachEarnings * input.finance.staffPerformanceRate;
    const incubationReward = qualification.admitted * input.finance.incubationReward;
    const fixedCosts = input.finance.rent + input.finance.monthlyOffice + input.finance.otherFixedCosts;
    const operatingNet = operatingContribution - overhead - staffBaseSalary - staffPerformance - incubationReward - fixedCosts;
    const cashInflow = coachCashOrders + directRevenue;
    const oneTimeCosts = month === 1 ? input.finance.deposit + input.finance.setupFee : 0;
    const cashOutflow = productCost + rewardCash + overhead + staffBaseSalary + staffPerformance + incubationReward + fixedCosts + oneTimeCosts;
    const netCashFlow = cashInflow - cashOutflow;
    state.cash += netCashFlow;
    state.cumulativeCashFlow += netCashFlow;

    const capacity = calculateStaffCapacity(state.staffCount, servedCoaches, managedUsers, input);
    months.push({
      month, cashBalance: state.cash, cumulativeCashFlow: state.cumulativeCashFlow,
      cashInflow, cashOutflow, netCashFlow, confirmedRevenue, directRevenue,
      coachOrderRevenue, terminalGMV, operatingContribution, operatingNet,
      productCost, overhead, fixedCosts, staffBaseSalary, staffPerformance,
      incubationReward, dataRewards, referralRewards, rewardCash,
      rewardOffsetUsed, rewardOffsetAccrued, rewardLiability, coachEarnings,
      coachOrderBoxes, firstCaseBoxes, coachSoldBoxes, directPaidBoxes,
      directFreeBoxes: seed.freeBoxes, coachInventory, dormantInventory,
      shortageBoxes, servedCoaches, endingActiveCoaches, newlyDormantCoaches: dormantCoaches,
      activeCoaches: servedCoaches, dormantCoaches, admittedCoaches: qualification.admitted,
      newCandidates: qualification.newCandidates, newSupportRecords: qualification.newSupportRecords,
      custodiedUsers, completedUsers, managedUsers, staffCount: state.staffCount,
      coachCapacity: capacity.coachCapacity, userCapacity: capacity.userCapacity,
      capacityUtilization: capacity.capacityUtilization,
      suggestedStaffCount: capacity.suggestedStaffCount,
      staffExpansionGap: capacity.staffExpansionGap, capacityWarning: capacity.capacityWarning,
      direct: directResult.record, coachMonths,
    });
    if (input.staff.autoExpand) {
      state.staffCount = Math.max(state.staffCount, capacity.suggestedStaffCount);
    }
  }
  return { months, finalState: state };
}
