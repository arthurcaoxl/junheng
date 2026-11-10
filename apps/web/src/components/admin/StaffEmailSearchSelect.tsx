import { useEffect, useState } from "react";
import { searchAdminStaffDirectory, type StaffMember } from "../../services/adminStaff";

type Props = {
  id: string;
  label: string;
  selectedId: string;
  disabled?: boolean;
  onSelect: (staff: StaffMember | null) => void;
};

export default function StaffEmailSearchSelect({ id, label, selectedId, disabled = false, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<StaffMember[]>([]);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const keyword = query.trim();
    if (selectedId || keyword.length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      searchAdminStaffDirectory(keyword).then((rows) => {
        if (alive) {
          setOptions(rows);
          setSearchCompleted(true);
          setError("");
        }
      }).catch((cause: unknown) => {
        if (alive) {
          setOptions([]);
          setSearchCompleted(false);
          setError(cause instanceof Error ? cause.message : "员工邮箱搜索失败。");
        }
      });
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, selectedId]);

  return (
    <div className="coach-email-search">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        aria-controls={`${id}-options`}
        autoComplete="off"
        placeholder="输入至少 2 位邮箱字符"
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setOptions([]);
          setSearchCompleted(false);
          setError("");
          onSelect(null);
        }}
      />
      {selectedId && query && <small className="admin-hint">已选择 {query}</small>}
      {error && <p className="admin-error" role="alert">{error}</p>}
      {searchCompleted && !selectedId && !error && options.length === 0 && (
        <p className="admin-hint" role="status">无匹配员工</p>
      )}
      {options.length > 0 && (
        <ul id={`${id}-options`} role="listbox" className="coach-email-options" aria-label={`${label}搜索结果`}>
          {options.map((staff) => (
            <li key={staff.staffId}>
              <button
                type="button"
                role="option"
                aria-selected={selectedId === staff.staffId}
                onClick={() => {
                  onSelect(staff);
                  setQuery(staff.email);
                  setOptions([]);
                  setSearchCompleted(false);
                }}
              >
                <span className="coach-email-option-primary">{staff.email}</span>
                <span className="coach-email-option-meta">
                  {staff.isActive ? "在职" : "停用"} · {staff.coachCount} 名教练 · {staff.camperCount} 名体验官
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
