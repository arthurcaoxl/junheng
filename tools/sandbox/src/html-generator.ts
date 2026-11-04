import {
  channelUnitEconomics, monthlyCustomerValue, monthlyRecurringBoxes,
  rewardPerBox, settleCoachOrder, settleCoachRewards,
} from './economics';
import {
  addCompleterOutcomes, applyQualification, calculateStaffCapacity,
  clampRatio, emptyUserChannel, isCoachCohortActive, resolveUserRates,
  runSeedMonth, scenarioMultipliers, simulate, simulateUserMonth, splitCompleters,
} from './engine';
import {
  buildDashboard, calculateChannelLTV, equivalentMaintenanceBEP,
  firstReachedMonth, summarizeScenario, sustainableOperatingNet,
} from './metrics';
import type { MonthResult } from './engine';
import type { ScenarioResult } from './metrics';
import type { SandboxInput, ScenarioKey } from './schema';

const ENGINE_FUNCTIONS = [
  monthlyRecurringBoxes, monthlyCustomerValue, rewardPerBox, channelUnitEconomics,
  settleCoachOrder, settleCoachRewards, emptyUserChannel, clampRatio,
  scenarioMultipliers, resolveUserRates, splitCompleters, addCompleterOutcomes,
  simulateUserMonth, runSeedMonth, applyQualification, isCoachCohortActive,
  simulate, calculateStaffCapacity, firstReachedMonth, sustainableOperatingNet,
  equivalentMaintenanceBEP, calculateChannelLTV, summarizeScenario, buildDashboard,
];

const SLIDERS = [
  { key: 'retention', label: '月度维持留存率', min: 0, max: 100, step: 'any', expr: "Number(this.value) + '%'" },
  { key: 'acquisition', label: '教练人均月新拓', min: 0, max: 20, step: 'any', expr: "Number(this.value) + ' 人'" },
  { key: 'candidate', label: '教练候选率', min: 0, max: 100, step: 'any', expr: "Number(this.value) + '%'" },
] as const;

const NUMBER_INPUTS = [
  { key: 'rent', label: '月度房租', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'office', label: '行政办公', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'staff', label: '初始员工数', unit: '人', min: 1, step: '1', integer: true },
  { key: 'salary', label: '员工月底薪', unit: '元', min: 0, step: 'any', integer: false },
  { key: 'seed1', label: '种子 1 期投放', unit: '人', min: 0, step: '1', integer: true },
  { key: 'seed2', label: '种子 2 期投放', unit: '人', min: 0, step: '1', integer: true },
] as const;

function parseControlValue(raw: string, min: number, integer: boolean): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) return null;
  return value;
}

export function generateReport(input: SandboxInput): string {
  const initialDashboard = buildDashboard(input);
  const engineJs = [...ENGINE_FUNCTIONS, parseControlValue].map((fn) => fn.toString()).join('\n');
  const state = {
    retention: input.users.monthlyRetention * 100,
    acquisition: input.coaches.monthlyNewUsersPerCoach,
    candidate: input.coaches.candidateRate * 100,
    rent: input.finance.rent,
    office: input.finance.monthlyOffice,
    staff: input.staff.initialCount,
    salary: input.staff.monthlySalary,
    seed1: input.seed.phase1.users,
    seed2: input.seed.phase2.users,
    scenario: 'baseline' as ScenarioKey,
  };
  const numberControls = NUMBER_INPUTS.map((control) => `
    <label class="control"><span>${control.label}</span><span class="number-wrap">
      <input type="number" id="ci-${control.key}" value="${state[control.key]}" min="${control.min}" step="${control.step}" />
      <em>${control.unit}</em></span></label>`).join('');
  const sliderControls = SLIDERS.map((control) => {
    const max = control.key === 'acquisition' ? Math.max(control.max, state.acquisition) : control.max;
    return `
    <label class="slider"><span>${control.label}</span><output id="val-${control.key}"></output>
      <input type="range" id="sl-${control.key}" min="${control.min}" max="${max}" step="${control.step}" value="${state[control.key]}" />
    </label>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>菌衡计划 V7.1 · CEO 经营驾驶舱</title>
<style>
:root{--bg:#0b1110;--panel:#131c1a;--line:#2a3935;--text:#edf5f1;--muted:#93a69f;--green:#9ddd70;--red:#ff786f;--blue:#72b7ff;--amber:#f2bc68}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 -apple-system,"PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:28px 18px 60px}h1{font-size:25px;margin:0}h2{font-size:16px;margin:0 0 16px}p{color:var(--muted)}.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.control,.slider{display:flex;flex-direction:column;gap:6px;color:var(--muted)}.number-wrap{display:flex;align-items:center;background:var(--bg);padding:7px 10px;border-radius:8px}.number-wrap input{width:100%;border:0;background:transparent;color:var(--green);font:inherit}.number-wrap em{font-style:normal}.slider output{float:right;color:var(--green)}.slider input{width:100%;accent-color:var(--green)}.scenarios{display:flex;gap:8px;margin:16px 0}.scenarios button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:8px 18px;border-radius:20px;cursor:pointer}.scenarios button.active{background:var(--green);color:#10200f}.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.kpi{padding:16px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.kpi strong{display:block;font-size:24px;color:var(--green);margin:6px 0}.kpi small{color:var(--muted)}.delta{font-size:12px;color:var(--blue)}.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}.chart svg{width:100%;height:auto}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}th{color:var(--muted)}nav{display:flex;gap:16px;flex-wrap:wrap}nav a{color:var(--blue)}pre{white-space:pre-wrap;color:var(--muted);font-size:12px}.warn{color:var(--red)}
</style></head><body><main>
<header><h1>菌衡计划 V7.1 · CEO 经营驾驶舱</h1><p>${input.horizonMonths} 个月月度 cohort ｜ 双渠道经济 ｜ 所有数字由输入实时推导</p></header>
<section class="panel"><h2>经营假设</h2><div class="controls">${numberControls}${sliderControls}</div></section>
<div class="scenarios"><button class="active" data-scenario="baseline">基准</button><button data-scenario="stress">压力</button><button data-scenario="upside">进取</button></div>
<section id="kpis" class="kpis"></section>
<section class="charts">
  <div class="panel chart"><h2>现金余额与最低点</h2><div id="cash-chart"></div></div>
  <div class="panel chart"><h2>平台经营净额</h2><div id="operating-chart"></div></div>
  <div class="panel chart"><h2>活跃／休眠教练</h2><div id="coach-chart"></div></div>
  <div class="panel chart"><h2>教练库存与缺货</h2><div id="inventory-chart"></div></div>
  <div class="panel chart"><h2>员工容量利用率</h2><div id="capacity-chart"></div></div>
</section>
<section class="panel"><nav><a href="#users-drilldown">用户增长与分流</a><a href="#coaches-drilldown">教练准入与休眠</a><a href="#finance-drilldown">库存分润与平台损益</a><a href="#staff-drilldown">员工容量与扩编</a></nav></section>
<section id="users-drilldown" class="panel"><h2>用户增长与分流</h2><div id="users-table"></div><div id="ltv"></div></section>
<section id="coaches-drilldown" class="panel"><h2>教练准入与休眠</h2><div id="coaches-table"></div></section>
<section id="finance-drilldown" class="panel"><h2>库存分润与平台损益</h2><div id="finance-table"></div></section>
<section id="staff-drilldown" class="panel"><h2>员工容量与扩编</h2><div id="staff-table"></div></section>
<section class="panel"><h2>月度审计明细</h2><div id="audit-table"></div><h2>公式说明</h2><p>月复购盒数＝每月袋数÷每盒袋数；validRecordRate 是已达到 requiredRecordedDays 要求的聚合占比，场景系数只调整候选、不调整扶持记录；教练容量按当月服务教练及其用户计算，包含月末新休眠、次月才托管的队列；教练拿货收入与终端 GMV 分列；持续经营净额剔除新教练首箱拿货贡献；奖励抵扣只影响现金与负债；未达月份显示「未达到」。</p><h2>输入快照</h2><pre id="input-snapshot"></pre></section>
<footer>本地经营沙盘，不构成收益或经营结果承诺。</footer>
</main><script>
'use strict';
${engineJs}
const BASE_INPUT = ${JSON.stringify(input)};
const INITIAL_DASHBOARD = ${JSON.stringify(initialDashboard)};
const state = ${JSON.stringify(state)};
let dashboard = INITIAL_DASHBOARD;
function currentInput() {
  const input = JSON.parse(JSON.stringify(BASE_INPUT));
  input.users.monthlyRetention = state.retention / 100;
  input.coaches.monthlyNewUsersPerCoach = state.acquisition;
  input.coaches.candidateRate = state.candidate / 100;
  input.finance.rent = state.rent;
  input.finance.monthlyOffice = state.office;
  input.staff.initialCount = state.staff;
  input.staff.monthlySalary = state.salary;
  input.seed.phase1.users = state.seed1;
  input.seed.phase2.users = state.seed2;
  return input;
}
function money(n) { return Math.round(n).toLocaleString('zh-CN') + ' 元'; }
function number(n) { return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 1 }); }
function month(n) { return n === null ? '未达到' : '第 ' + n + ' 月'; }
function delta(current, base, suffix) {
  const d = current - base;
  return '较基准 ' + (d >= 0 ? '+' : '') + number(d) + (suffix || '');
}
function monthDelta(current, base) {
  if (current === null && base === null) return '与基准均未达到';
  if (current === null) return '较基准变为未达到';
  if (base === null) return '较基准新达到';
  if (current === base) return '与基准一致';
  return '较基准 ' + (current < base ? '提前 ' : '推迟 ') + number(Math.abs(current - base)) + ' 月';
}
function userTotal(m, key) {
  let total = m.direct[key];
  for (const coach of m.coachMonths) total += coach.users[key];
  return total;
}
function table(headers, rows) {
  let html = '<div class="table-wrap"><table><thead><tr>';
  for (const h of headers) html += '<th>' + h + '</th>';
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const cell of row) html += '<td>' + cell + '</td>';
    html += '</tr>';
  }
  return html + '</tbody></table></div>';
}
function buildChart(months, series) {
  const W = 620, H = 240, P = 38;
  let min = 0, max = 1;
  for (const item of series) for (const m of months) {
    min = Math.min(min, item.value(m));
    max = Math.max(max, item.value(m));
  }
  const span = max - min || 1;
  function x(i) { return P + i * (W - P * 2) / Math.max(1, months.length - 1); }
  function y(v) { return H - P - (v - min) * (H - P * 2) / span; }
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img">';
  svg += '<line x1="' + P + '" y1="' + y(0) + '" x2="' + (W - P) + '" y2="' + y(0) + '" stroke="#2a3935"/>';
  for (const item of series) {
    let points = '';
    let minimumIndex = 0;
    for (let i = 0; i < months.length; i++) {
      points += x(i) + ',' + y(item.value(months[i])) + ' ';
      if (item.value(months[i]) < item.value(months[minimumIndex])) minimumIndex = i;
    }
    svg += '<polyline points="' + points + '" fill="none" stroke="' + item.color + '" stroke-width="2.5"/>';
    if (item.markMinimum) {
      svg += '<circle cx="' + x(minimumIndex) + '" cy="' + y(item.value(months[minimumIndex])) + '" r="5" fill="#0b1110" stroke="' + item.color + '" stroke-width="3"/>';
    }
  }
  svg += '<text x="' + P + '" y="18" fill="#93a69f" font-size="11">' + number(max) + '</text>';
  svg += '<text x="' + P + '" y="' + (H - 8) + '" fill="#93a69f" font-size="11">' + number(min) + '</text></svg>';
  return svg;
}
function renderKpis(result, baseline) {
  const m = result.metrics, b = baseline.metrics;
  const cards = [
    ['现金安全', month(m.cashBreakMonth), '安全月数 ' + m.cashSafetyMonths + '；最低 ' + money(m.minCashBalance), delta(m.endingCash, b.endingCash, ' 元')],
    ['月度经营保本', month(m.operatingBreakEvenMonth), '持续经营：' + month(m.sustainableBreakEvenMonth), monthDelta(m.operatingBreakEvenMonth, b.operatingBreakEvenMonth)],
    ['累计现金回正', month(m.cashPaybackMonth), '不含期初现金，覆盖押金与开办费', monthDelta(m.cashPaybackMonth, b.cashPaybackMonth)],
    ['期末现金', money(m.endingCash), '第 ' + result.months.length + ' 月', delta(m.endingCash, b.endingCash, ' 元')],
    ['教练健康', number(m.activeCoaches) + ' 活跃', '当月休眠 ' + number(m.dormantCoaches) + '；休眠率 ' + number(m.dormancyRate * 100) + '%', delta(m.activeCoaches, b.activeCoaches, ' 人')],
    ['库存与组织预警', number(m.shortageBoxes) + ' 盒缺货', '滞留 ' + number(m.dormantInventory) + ' 盒；扩编缺口 ' + m.staffExpansionGap, delta(m.shortageBoxes, b.shortageBoxes, ' 盒')],
  ];
  let html = '';
  for (const card of cards) html += '<article class="kpi"><span>' + card[0] + '</span><strong>' + card[1] + '</strong><small>' + card[2] + '</small><div class="delta">' + card[3] + '</div></article>';
  document.getElementById('kpis').innerHTML = html;
}
function renderTables(result, input) {
  const months = result.months;
  document.getElementById('users-table').innerHTML = table(
    ['月份', '新首购', '实际首购', '延伸', '维持', '完赛', '流失', '托管迁入'],
    months.map((m) => [m.month, number(userTotal(m, 'newFirstPurchaseUsers')), number(userTotal(m, 'actualFirstPurchaseUsers')), number(userTotal(m, 'extensionUsers')), number(userTotal(m, 'maintenanceUsers')), number(m.completedUsers), number(userTotal(m, 'churnedUsers')), number(m.custodiedUsers)]),
  );
  document.getElementById('ltv').innerHTML = '<p>教练渠道 12 月 LTV：' + money(result.ltv.coach.netLTV['12']) + '；直营／托管 12 月 LTV：' + money(result.ltv.direct.netLTV['12']) + '</p>';
  document.getElementById('coaches-table').innerHTML = table(
    ['月份', '新增候选', '新增扶持记录', '正式准入', '活跃', '休眠', '教练实际收益', '奖励负债'],
    months.map((m) => [m.month, number(m.newCandidates), number(m.newSupportRecords), number(m.admittedCoaches), number(m.activeCoaches), number(m.dormantCoaches), money(m.coachEarnings), money(m.rewardLiability)]),
  );
  document.getElementById('finance-table').innerHTML = table(
    ['月份', '拿货盒数', '首箱盒数', '库存', '缺货', '终端 GMV', '确认收入', '经营净额', '持续经营净额', '等效维持用户 BEP'],
    months.map((m, index) => [m.month, number(m.coachOrderBoxes), number(m.firstCaseBoxes), number(m.coachInventory), number(m.shortageBoxes), money(m.terminalGMV), money(m.confirmedRevenue), money(m.operatingNet), money(sustainableOperatingNet(m, input)), result.equivalentMaintenanceBEP[index] === null ? '未达到' : number(result.equivalentMaintenanceBEP[index]) + ' 人']),
  );
  document.getElementById('staff-table').innerHTML = table(
    ['月份', '员工', '教练容量', '用户容量', '利用率', '建议员工', '扩编缺口', '底薪', '孵化奖', '绩效'],
    months.map((m) => [m.month, m.staffCount, number(m.coachCapacity), number(m.userCapacity), number(m.capacityUtilization * 100) + '%', m.suggestedStaffCount, m.staffExpansionGap, money(m.staffBaseSalary), money(m.incubationReward), money(m.staffPerformance)]),
  );
  document.getElementById('audit-table').innerHTML = table(
    ['月份', '现金流入', '现金流出', '期末现金', '奖励抵扣', '奖励付现', '产品成本', '动态平摊'],
    months.map((m) => [m.month, money(m.cashInflow), money(m.cashOutflow), money(m.cashBalance), money(m.rewardOffsetUsed), money(m.rewardCash), money(m.productCost), money(m.overhead)]),
  );
}
function render() {
  const input = currentInput();
  dashboard = buildDashboard(currentInput());
  const result = dashboard.scenarios[state.scenario];
  renderKpis(result, dashboard.scenarios.baseline);
  const months = result.months;
  document.getElementById('cash-chart').innerHTML = buildChart(months, [{ color: '#9ddd70', value: (m) => m.cashBalance, markMinimum: true }]);
  document.getElementById('operating-chart').innerHTML = buildChart(months, [
    { color: '#9ddd70', value: (m) => m.operatingNet },
    { color: '#72b7ff', value: (m) => sustainableOperatingNet(m, input) },
  ]);
  document.getElementById('coach-chart').innerHTML = buildChart(months, [
    { color: '#9ddd70', value: (m) => m.activeCoaches },
    { color: '#ff786f', value: (m) => m.dormantCoaches },
  ]);
  document.getElementById('inventory-chart').innerHTML = buildChart(months, [
    { color: '#f2bc68', value: (m) => m.coachInventory },
    { color: '#ff786f', value: (m) => m.shortageBoxes },
  ]);
  document.getElementById('capacity-chart').innerHTML = buildChart(months, [{ color: '#72b7ff', value: (m) => m.capacityUtilization * 100 }]);
  renderTables(result, input);
  document.getElementById('input-snapshot').textContent = JSON.stringify(input, null, 2);
}
let debounceTimer = null;
function scheduleRender() { clearTimeout(debounceTimer); debounceTimer = setTimeout(render, 50); }
${SLIDERS.map((s) => `
state['${s.key}'] = Number(document.getElementById('sl-${s.key}').value);
document.getElementById('val-${s.key}').textContent = ${s.expr.replace(/this\.value/g, "document.getElementById('sl-" + s.key + "').value")};
document.getElementById('sl-${s.key}').addEventListener('input', function () {
  state['${s.key}'] = Number(this.value);
  document.getElementById('val-${s.key}').textContent = ${s.expr};
  scheduleRender();
});`).join('\n')}
${NUMBER_INPUTS.map((c) => `
document.getElementById('ci-${c.key}').addEventListener('input', function () {
  const value = parseControlValue(this.value, ${c.min}, ${c.integer});
  if (value !== null) { state['${c.key}'] = value; scheduleRender(); }
});`).join('\n')}
document.querySelectorAll('[data-scenario]').forEach(function (button) {
  button.addEventListener('click', function () {
    state.scenario = button.getAttribute('data-scenario');
    document.querySelectorAll('[data-scenario]').forEach(function (item) { item.classList.remove('active'); });
    button.classList.add('active');
    scheduleRender();
  });
});
render();
</script></body></html>`;
}
