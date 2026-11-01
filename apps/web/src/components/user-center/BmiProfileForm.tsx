import { useState, type FormEvent } from "react";
import { parseKg } from "../../utils/weight";

export type BmiProfileInput = {
  heightCm: string;
  initialWeightKg?: string;
};

type BmiProfileFormProps = {
  heightCm?: string;
  initialWeightKg?: string;
  onSave: (profile: BmiProfileInput) => void | Promise<void>;
  onCancel: () => void;
};

export function BmiProfileForm({ heightCm = "", initialWeightKg = "", onSave, onCancel }: BmiProfileFormProps) {
  const [height, setHeight] = useState(heightCm);
  const [initialWeight, setInitialWeight] = useState(initialWeightKg);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedHeight = height.trim();
    const normalizedInitialWeight = initialWeight.trim();
    if (parseKg(normalizedHeight) === null) {
      setError("请输入有效身高（大于 0 cm）。");
      return;
    }
    if (normalizedInitialWeight && parseKg(normalizedInitialWeight) === null) {
      setError("初始体重需为大于 0 的有效数字，或重置为自动取值。");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await onSave({
        heightCm: normalizedHeight,
        ...(normalizedInitialWeight ? { initialWeightKg: normalizedInitialWeight } : {}),
      });
    } catch {
      setError("保存失败，请检查浏览器存储空间后重试。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="bmi-profile-form" onSubmit={submit} noValidate aria-busy={saving}>
      <div className="bmi-profile-fields">
        <label>
          <span>身高（cm）</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={height}
            onChange={(event) => setHeight(event.target.value)}
            placeholder="例如 168"
            disabled={saving}
            required
          />
        </label>
        <label>
          <span>初始体重（kg，可选）</span>
          <input
            type="text"
            inputMode="decimal"
            value={initialWeight}
            onChange={(event) => setInitialWeight(event.target.value)}
            placeholder="默认取首日体重"
            disabled={saving}
          />
        </label>
      </div>
      <p className="bmi-profile-hint">留空将自动采用您本期打卡的第一笔有效体重作为初始值。</p>
      {error && <p className="bmi-profile-error" role="alert">{error}</p>}
      <div className="bmi-profile-actions">
        <button type="submit" className="bmi-primary-button" disabled={saving}>{saving ? "保存中…" : "保存档案"}</button>
        <button type="button" className="bmi-text-button" onClick={() => { setInitialWeight(""); setError(""); }} disabled={saving}>重置为自动取值</button>
        <button type="button" className="bmi-text-button" onClick={onCancel} disabled={saving}>取消</button>
      </div>
    </form>
  );
}
