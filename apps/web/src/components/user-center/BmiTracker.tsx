import { useEffect, useMemo, useState } from "react";
import { getBmiTracking } from "../../utils/bmi";
import type { CheckInState } from "../../utils/checkin";
import { parseKg } from "../../utils/weight";
import { BmiProfileForm, type BmiProfileInput } from "./BmiProfileForm";
import { BmiScale } from "./BmiScale";
import { BmiSummaryCards } from "./BmiSummaryCards";
import { BmiTargetGap } from "./BmiTargetGap";
import { BmiTrendChart } from "./BmiTrendChart";

type BmiTrackerProps = {
  state: CheckInState;
  onSave: (next: CheckInState) => void | Promise<void>;
};

export function BmiTracker({ state, onSave }: BmiTrackerProps) {
  const [editing, setEditing] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const tracking = useMemo(() => getBmiTracking(state), [state]);
  const hasHeight = parseKg(state.heightCm) !== null;

  useEffect(() => {
    if (!toastVisible) return;
    const timer = window.setTimeout(() => setToastVisible(false), 2800);
    return () => window.clearTimeout(timer);
  }, [toastVisible]);

  const saveProfile = async (profile: BmiProfileInput) => {
    const next: CheckInState = { ...state, heightCm: profile.heightCm };
    if (profile.initialWeightKg) next.initialWeightKg = profile.initialWeightKg;
    else delete next.initialWeightKg;
    await onSave(next);
    setEditing(false);
    setToastVisible(true);
  };

  return (
    <section className="bmi-tracker" aria-label="BMI 动态追踪">
      <header className="bmi-tracker-heading">
        <div>
          <span>BODY MASS INDEX</span>
          <h2>BMI 动态追踪</h2>
          <p>输入身高，系统将自动结合您的体重记录，计算并追踪 BMI 变化。</p>
        </div>
        {hasHeight && !editing && <button type="button" className="bmi-secondary-button" onClick={() => setEditing(true)}>编辑基础档案</button>}
      </header>

      {editing ? (
        <BmiProfileForm
          heightCm={state.heightCm}
          initialWeightKg={state.initialWeightKg}
          onSave={saveProfile}
          onCancel={() => setEditing(false)}
        />
      ) : !hasHeight ? (
        <div className="bmi-profile-empty">
          <div><strong>待完善基础档案</strong><p>补充身高后，即可基于现有打卡体重自动计算 BMI，无需重复录入。</p></div>
          <button type="button" className="bmi-primary-button" onClick={() => setEditing(true)}>完善基础档案</button>
        </div>
      ) : (
        <>
          <BmiSummaryCards tracking={tracking} customizedInitial={parseKg(state.initialWeightKg) !== null} />
          <BmiTargetGap currentWeightKg={tracking.current?.weightKg} heightCm={state.heightCm} />
          {tracking.current ? (
            <>
              <BmiScale bmi={tracking.current.bmi} />
              {tracking.series.length >= 2
                ? <BmiTrendChart points={tracking.series} />
                : <p className="bmi-trend-hint">再记录 1 天有效体重即可生成 BMI 趋势。</p>}
            </>
          ) : <p className="bmi-weight-empty">暂无有效体重记录。完成每日打卡后，将自动计算并展示 BMI。</p>}
        </>
      )}

      <p className="bmi-disclaimer">BMI 判定标准引用自《成人体重判定》（WS/T 428—2013）。仅作为日常观察参考，不构成医疗诊断。</p>
      {toastVisible && <div className="bmi-toast" role="status">身高档案已更新，BMI 已重新计算</div>}
    </section>
  );
}
