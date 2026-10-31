import { useRef, useState } from "react";
import { RecordTrends } from "./RecordTrends";
import { WaterFluctuation } from "./WaterFluctuation";
import { createRecordPoster } from "../utils/recordPoster";
import { useSyncStatus } from "../hooks/useSyncStatus";
import { openSyncModal } from "../services/syncUi";
import {
  TOTAL_DAYS,
  STORAGE_KEY,
  LEGACY_V1_KEY,
  LEGACY_V2_KEY,
  buildWindowRecords,
  clampActiveDate,
  diffDays,
  emptyDay,
  exportCheckInCsv,
  formatShortDate,
  getCampStats,
  getWindowDates,
  hasContent,
  isDateKey,
  loadState,
  todayKey,
} from "../utils/checkin";
import type { CheckInState } from "../utils/checkin";
import { scheduleSyncToCloud } from "../services/checkinSync";
import {
  clothesKg,
  deriveWeightCache,
  netWeight,
  representativeFromNodes,
  WEIGHT_NODES,
  type NodeWeights,
  type WeightNode,
} from "../utils/weight";

const NAME_STORAGE_KEY = "junheng-checkin-name-v1";
const TOAST_SNOOZE_KEY = "junheng-sync-toast-snooze"; // 独立键，与 v3 无关

function isToastSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(TOAST_SNOOZE_KEY) ?? 0);
    return Date.now() - at < 7 * 24 * 3600 * 1000; // 点"稍后再说"后 7 天内不再弹
  } catch {
    return false;
  }
}

export type DayRecord = {
  weight: string;
  waist: string;
  meals: boolean[];
  water: boolean;
  movement: boolean;
  sleep: boolean;
  weights?: NodeWeights; // 多节点原始称重值（未扣衣物），weights 存在时为唯一真相
  clothes?: string;      // 当天衣物重量快照（kg）
};

function loadName() {
  try {
    return window.localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function SevenDayCheckIn() {
  const [state, setState] = useState<CheckInState>(loadState);
  const [activeDate, setActiveDate] = useState(() => clampActiveDate(state));
  const [recordName, setRecordName] = useState(loadName);
  const [storageError, setStorageError] = useState(false);
  const [posterUrl, setPosterUrl] = useState("");
  const [posterError, setPosterError] = useState(false);
  const [showExtraNodes, setShowExtraNodes] = useState(false);
  const [editingClothes, setEditingClothes] = useState(false);
  const [clothesDraft, setClothesDraft] = useState("0");
  const [trendUnlocked, setTrendUnlocked] = useState(false);
  const { configured: syncConfigured, email: syncEmail } = useSyncStatus();
  const [toastDays, setToastDays] = useState<number | null>(null);
  const toastShownRef = useRef(false);
  const today = todayKey();
  const windowDates = getWindowDates(state.startDate);
  const enabledDates = windowDates.filter((key) => key <= today);
  const activeIndex = Math.max(diffDays(state.startDate, activeDate), 0);
  const current = state.records[activeDate] ?? emptyDay();
  const stats = getCampStats(state);
  const requiresMilestoneBinding = syncConfigured && !syncEmail && stats.elapsedDays >= 7;

  const commitState = (next: CheckInState) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    scheduleSyncToCloud(); // 只调度防抖上传，不改 v3 写入逻辑本身

    // D3 轻提醒：达到第 3 天时仅提示一次；点“暂不”后 7 天内不再弹。
    if (syncConfigured && !syncEmail && !toastShownRef.current && !isToastSnoozed()) {
      const days = getCampStats(next).recordedDays;
      if (days === 3) {
        toastShownRef.current = true;
        window.setTimeout(() => setToastDays(days), 1500);
      }
    }
  };

  const updateName = (value: string) => {
    setRecordName(value);
    try {
      if (value) window.localStorage.setItem(NAME_STORAGE_KEY, value);
      else window.localStorage.removeItem(NAME_STORAGE_KEY);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };

  const updateDay = (patch: Partial<DayRecord>) => {
    const nextDay = { ...current, ...patch };
    // weight 仅为派生缓存：weights 有有效节点时重算，否则保留旧值（契约见 storage-v3.md）
    nextDay.weight = deriveWeightCache(nextDay);
    const records = { ...state.records };
    if (hasContent(nextDay)) records[activeDate] = nextDay;
    else delete records[activeDate];
    commitState({ ...state, records });
  };

  // 多节点体重：旧数据只有 weight 时，首次编辑把旧值带入 morning（编辑才升级，只读不改旧数据）
  const effectiveClothes = current.clothes ?? state.clothesWeight ?? "0";
  const nodeValue = (node: WeightNode) =>
    current.weights ? (current.weights[node] ?? "") : (node === "morning" ? current.weight : "");
  const updateNode = (node: WeightNode, value: string) => {
    const base: NodeWeights = current.weights ?? (current.weight ? { morning: current.weight } : {});
    updateDay({
      weights: { ...base, [node]: value },
      clothes: current.clothes ?? state.clothesWeight ?? "0", // 录入当天快照
    });
  };
  const representative = representativeFromNodes(current.weights, effectiveClothes);

  const beginClothesEdit = () => {
    setClothesDraft(state.clothesWeight ?? "0");
    setEditingClothes(true);
  };

  const confirmClothesEdit = () => {
    const clothesWeight = String(clothesKg(clothesDraft));
    let next: CheckInState = { ...state, clothesWeight };
    // 设置确认后立即作用于今天，历史日期仍保留各自快照。
    if (activeDate === today && current.weights) {
      const nextDay = { ...current, clothes: clothesWeight };
      nextDay.weight = deriveWeightCache(nextDay);
      next = { ...next, records: { ...state.records, [activeDate]: nextDay } };
    }
    commitState(next);
    setEditingClothes(false);
  };

  const updateMeal = (mealIndex: number, checked: boolean) => {
    updateDay({ meals: current.meals.map((value, index) => index === mealIndex ? checked : value) });
  };

  const selectDate = (key: string) => {
    if (key > today) return;
    setActiveDate(key);
    const tab = document.getElementById(`day-tab-${key}`);
    tab?.focus();
    tab?.scrollIntoView?.({ block: "nearest", inline: "center" });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = enabledDates.indexOf(activeDate);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = Math.min(currentIndex + 1, enabledDates.length - 1);
    else if (event.key === "ArrowLeft") nextIndex = Math.max(currentIndex - 1, 0);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabledDates.length - 1;
    else return;
    event.preventDefault();
    if (enabledDates[nextIndex]) selectDate(enabledDates[nextIndex]);
  };

  const updateStartDate = (value: string) => {
    if (!isDateKey(value)) return;
    const next = { ...state, startDate: value };
    commitState(next);
    setActiveDate(clampActiveDate(next, activeDate <= today ? activeDate : today));
  };

  const buildPoster = () => createRecordPoster(buildWindowRecords(state), recordName, {
    userCode: state.userCode,
    startDate: state.startDate,
    endDate: stats.endDate,
  });

  const exportPoster = () => {
    try {
      setPosterUrl(buildPoster());
      setPosterError(false);
    } catch {
      setPosterError(true);
    }
  };

  const openMilestoneBinding = (onSuccess: () => void) => {
    let previewUrl = "";
    try { previewUrl = buildPoster(); } catch { /* 无 Canvas 时仅降级头图，不阻断绑定 */ }
    openSyncModal("bind", { milestone: true, posterUrl: previewUrl, onSuccess });
  };

  const requestPoster = () => {
    if (requiresMilestoneBinding) openMilestoneBinding(exportPoster);
    else exportPoster();
  };

  const requestTrends = () => {
    if (requiresMilestoneBinding) openMilestoneBinding(() => setTrendUnlocked(true));
    else setTrendUnlocked(true);
  };

  const exportCsv = () => {
    const blob = new Blob([exportCheckInCsv(state)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `菌衡计划-21天打卡-${state.userCode}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const clearRecords = () => {
    commitState({ ...state, records: {} });
    setRecordName("");
    try {
      window.localStorage.removeItem(LEGACY_V1_KEY);
      window.localStorage.removeItem(LEGACY_V2_KEY);
      window.localStorage.removeItem(NAME_STORAGE_KEY);
    } catch {
      setStorageError(true);
    }
    setPosterUrl("");
    setPosterError(false);
  };

  const recordedItems = [current.weight, current.waist, ...current.meals, current.water, current.movement, current.sleep].filter(Boolean).length;

  return (
    <section className="check-in section-pad" id="check-in" data-theme="forest" aria-labelledby="check-in-title">
      <div className="section-index"><span>18</span><span>21-DAY CHECK-IN</span></div>
      <header className="check-in-heading">
        <p className="eyebrow">不追赶固定数字，先看见自己的变化</p>
        <h2 id="check-in-title">21 天，看见自己的节奏。</h2>
        <p>第 1 天建立基线，第 21 天回看趋势。记录体重、腰围与每餐执行情况，也把饮水、运动和睡眠放进同一张图里。</p>
        <p className="check-in-persistence">感受到的减脂，坚持方能长期健康。</p>
        <p className="camp-range">本期周期：{state.startDate} 至 {stats.endDate} · 修改后自动保存，无需注册</p>
      </header>
      <WaterFluctuation />
      <div className="record-identity">
        <label htmlFor="record-name">姓名或网名</label>
        <input id="record-name" name="recordName" type="text" autoComplete="nickname" maxLength={30} placeholder="真实姓名或网名都可以（选填）" value={recordName} onChange={(event) => updateName(event.target.value)} />
        <p className="poster-identity-note">海报署名：{recordName.trim() || "健康营员"}</p>
        <label htmlFor="camp-start-date">开营日期</label>
        <input id="camp-start-date" name="campStartDate" type="date" value={state.startDate} onChange={(event) => updateStartDate(event.target.value)} />
        <p>调整开营日会重排第 1–21 天的日期，已有记录按真实日期保留。</p>
        <span className="record-code-label">营员代码</span>
        <div className="record-code"><strong>{state.userCode}</strong></div>
        <p>营员代码为您的专属唯一标识，生成后不可更改，用于海报展示与打卡记录。代码随海报与 CSV 一起导出，方便运营方按代码汇总。</p>
      </div>
      {stats.isComplete && (
        <div className="camp-complete" role="status">
          <strong>本期 21 天已结营</strong>
          <span>坚持记录 {stats.recordedDays} 天 · 坚持率 {stats.adherence}%（按已过 {stats.elapsedDays} 天计）。修改开营日期即可开启新一轮，历史记录仍按日期保留。</span>
        </div>
      )}
      <div className="day-tabs" role="tablist" aria-label="21 天打卡日期" onKeyDown={onKeyDown}>
        {windowDates.map((key, index) => {
          const isFuture = key > today;
          const isMissed = key < today && !hasContent(state.records[key]);
          return (
            <button
              type="button"
              role="tab"
              id={`day-tab-${key}`}
              aria-label={`第 ${index + 1} 天${index === 0 ? "建立基线" : index === TOTAL_DAYS - 1 ? "回看趋势" : ""}`}
              aria-selected={activeDate === key}
              aria-controls="day-panel"
              tabIndex={activeDate === key ? 0 : -1}
              key={key}
              disabled={isFuture}
              className={`${key === today ? "day-tab-today" : ""}${isMissed ? " day-tab-missed" : ""}`}
              onClick={() => selectDate(key)}
            >
              <span>DAY{isFuture ? " · 未到" : isMissed ? " · 补记" : ""}</span>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <small>{formatShortDate(key)}</small>
            </button>
          );
        })}
      </div>
      <div className="check-in-panel" role="tabpanel" id="day-panel" aria-labelledby={`day-tab-${activeDate}`}>
        <div className="check-in-panel-heading">
          <div><span>第 {activeIndex + 1} 天 · {activeIndex === 0 ? "建立基线" : activeIndex === TOTAL_DAYS - 1 ? "回看趋势" : "保持记录"}（{formatShortDate(activeDate)}）</span><h3>今天，照顾好这些小事。</h3></div>
          <strong>{recordedItems}<span> / 8 项已记录</span></strong>
        </div>
        <div className="body-metrics">
          <div className="clothes-settings clothes-inline">
            {editingClothes ? (
              <div className="clothes-settings-body clothes-editing">
                <label htmlFor="clothes-weight">衣物重量（kg）</label>
                <input
                  id="clothes-weight"
                  name="clothesWeight"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={clothesDraft}
                  onChange={(event) => setClothesDraft(event.target.value)}
                  autoFocus
                />
                <div className="clothes-chips" role="group" aria-label="常用衣物重量">
                  {["0", "0.5", "0.8", "1.0"].map((value) => (
                    <button key={value} type="button" onClick={() => setClothesDraft(value)}>{value} kg</button>
                  ))}
                </div>
                <div className="clothes-edit-actions">
                  <button type="button" className="clothes-confirm" onClick={confirmClothesEdit}>确认</button>
                  <button type="button" onClick={() => setEditingClothes(false)}>取消</button>
                </div>
              </div>
            ) : (
              <div className="clothes-settings-view">
                <span>晨起称重衣物扣减：默认 {state.clothesWeight ?? "0"} kg（可调整）</span>
                <button type="button" onClick={beginClothesEdit}>修改</button>
              </div>
            )}
            <p>仅晨起空腹记录会扣除该重量。建议晨起穿轻便睡衣测量。</p>
          </div>
          <div className="metrics-input-grid">
            {WEIGHT_NODES.filter((meta) => meta.key === "morning" || showExtraNodes || nodeValue(meta.key)).map((meta) => {
              const value = nodeValue(meta.key);
              const net = netWeight(value, meta.key === "morning" ? effectiveClothes : "0");
              return (
                <div className="weight-node" key={meta.key}>
                  <label>
                    <span className="weight-node-label">{meta.label}{meta.hint && <span className="weight-node-hint">{meta.hint}</span>}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.1"
                      placeholder="选填"
                      value={value}
                      aria-label={meta.label}
                      onChange={(event) => updateNode(meta.key, event.target.value)}
                    />
                  </label>
                  {meta.key === "morning" && value.trim() !== "" && net !== null && (
                    <p className="weight-net">{clothesKg(effectiveClothes) > 0 ? `已扣除衣物 ${clothesKg(effectiveClothes)} kg，当前净重 ${net.toFixed(1)} kg` : `当前净重 ${net.toFixed(1)} kg`}</p>
                  )}
                  {value.trim() !== "" && net === null && <p className="weight-net-warning" role="alert">请检查数值：有效体重需 ≥ 20 kg。</p>}
                </div>
              );
            })}
            <div className="weight-node waist-node">
              <label><span className="weight-node-label">腰围（cm）</span><input type="number" inputMode="decimal" min="0" step="0.1" placeholder="选填" value={current.waist} onChange={(event) => updateDay({ waist: event.target.value })} /></label>
            </div>
          </div>
          {!showExtraNodes && !nodeValue("noon") && !nodeValue("evening") && (
            <button type="button" className="weight-add-nodes" onClick={() => setShowExtraNodes(true)}>+ 记录中午/晚间体重（选填）</button>
          )}
          {representative.value !== null && (
            <div className="weight-summary">
              <strong>今日{representative.used.length === 1 && representative.used[0]?.node === "morning" ? "" : "参考"}体重：{representative.value.toFixed(1)} kg</strong>
              <span>
                {representative.used.length === 1 && representative.used[0]?.node === "morning"
                  ? clothesKg(effectiveClothes) > 0 ? "（已扣除衣物）" : "早晨空腹记录"
                  : "系统已结合您全天的水分波动综合计算，建议主要参考早晨的空腹数据。"}
              </span>
            </div>
          )}
          <p className="body-metrics-note">建议每天晨起空腹、穿相近衣物测量；单日波动不等于趋势。</p>
        </div>
        <div className="check-in-groups">
          <fieldset><legend>每餐打卡</legend>{["早餐前已饮用", "午餐前已饮用", "晚餐前已饮用"].map((label, index) => <label key={label}><input type="checkbox" checked={current.meals[index]} onChange={(event) => updateMeal(index, event.target.checked)} /><span>{label}</span></label>)}</fieldset>
          <fieldset><legend>生活习惯</legend><label><input type="checkbox" checked={current.water} onChange={(event) => updateDay({ water: event.target.checked })} /><span>完成适量饮水</span></label><label><input type="checkbox" checked={current.movement} onChange={(event) => updateDay({ movement: event.target.checked })} /><span>完成适量运动</span></label><label><input type="checkbox" checked={current.sleep} onChange={(event) => updateDay({ sleep: event.target.checked })} /><span>保持规律作息</span></label></fieldset>
        </div>
        <div className="check-in-actions">
          <p>{syncConfigured ? "记录不仅保存在当前设备，还会自动备份到云端；绑定邮箱后可在其他设备恢复。" : "记录仅保存在当前设备，不上传服务器。清理浏览器数据后可能无法恢复。"}</p>
          <button type="button" onClick={clearRecords}>清空本机记录</button>
        </div>
        <p className="storage-status" role="status">{storageError ? "当前浏览器无法保存，本次记录仅在页面打开期间有效。" : "修改后自动保存，无需注册。"}</p>
        {syncConfigured && !syncEmail && (
          <div className="sync-inline-hint">
            <p>☁️ 记录目前仅保存在本机。绑定邮箱，换手机/电脑也能接着打卡。</p>
            <button type="button" onClick={() => openSyncModal("bind")}>立即绑定</button>
          </div>
        )}
      </div>
      {!requiresMilestoneBinding || trendUnlocked ? (
        <RecordTrends records={buildWindowRecords(state)} />
      ) : (
        <section className="record-trends record-trends-locked" aria-label="21 天身体记录趋势">
          <div className="record-trends-heading"><span>MY 21-DAY RECORD</span><h3>真实记录，看得见。</h3><p>专属健康趋势已经生成。绑定邮箱后即可查看，换手机或清理缓存也能恢复记录。</p></div>
          <button type="button" className="trend-unlock-button" onClick={requestTrends}>查看趋势图</button>
        </section>
      )}
      <section className="poster-export" aria-labelledby="poster-export-title">
        <div className="poster-export-copy"><span>PERSONAL RECORD POSTER</span><h3 id="poster-export-title">把 21 天坚持，留成一张海报。</h3><p>只导出你的真实记录，不生成固定减重目标。微信内可长按图片保存，其他浏览器可下载 PNG。CSV 含营员代码与真实日期，可直接用 Excel 汇总统计。</p><button type="button" onClick={requestPoster}>导出记录海报</button><button type="button" className="csv-export" onClick={exportCsv}>导出打卡 CSV</button>{posterError && <p role="alert">当前浏览器无法生成海报，请更换浏览器后重试。</p>}</div>
        {posterUrl && <div className="poster-preview"><img src={posterUrl} alt="21 天健康记录海报预览" /><p>微信内可长按图片保存；也可以<a href={posterUrl} download="菌衡计划-21天健康记录.png">下载 PNG 海报</a>。</p><small>仅为个人健康记录，不代表固定减重目标或产品功效</small></div>}
      </section>
      <p className="check-in-note">21 天用于建立观察习惯，不设定固定减重目标。体重管理应结合合理饮食、适量运动与良好作息，个体结果存在差异。</p>
      {toastDays !== null && (
        <div className="sync-toast" role="status">
          <p>🎉 您已坚持打卡 {toastDays} 天！建议绑定邮箱，防止数据丢失，换手机也能接着打卡。</p>
          <div className="sync-toast-actions">
            <button type="button" className="sync-toast-bind" onClick={() => { setToastDays(null); openSyncModal("bind"); }}>去绑定</button>
            <button type="button" className="sync-toast-dismiss" onClick={() => {
              try { window.localStorage.setItem(TOAST_SNOOZE_KEY, String(Date.now())); } catch { /* 忽略 */ }
              setToastDays(null);
            }}>暂不</button>
          </div>
        </div>
      )}
    </section>
  );
}
