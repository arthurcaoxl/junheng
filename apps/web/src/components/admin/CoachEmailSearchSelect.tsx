import { useEffect, useState } from "react";
import { fetchAdminCoachDirectory, type AdminCoachDirectoryEntry } from "../../services/adminCoachDirectory";

type Props = {
  id: string;
  label: string;
  selectedId: string;
  disabled?: boolean;
  onSelect: (coach: AdminCoachDirectoryEntry | null) => void;
};

export default function CoachEmailSearchSelect({ id, label, selectedId, disabled = false, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AdminCoachDirectoryEntry[]>([]);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const keyword = query.trim();
    if (selectedId || keyword.length < 2) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      fetchAdminCoachDirectory(keyword).then((rows) => {
        if (alive) {
          setOptions(rows);
          setSearchCompleted(true);
          setError("");
        }
      }).catch((cause: unknown) => {
        if (alive) {
          setOptions([]);
          setSearchCompleted(false);
          setError(cause instanceof Error ? cause.message : "教练邮箱搜索失败。");
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
        <p className="admin-hint" role="status">无匹配教练</p>
      )}
      {options.length > 0 && (
        <ul id={`${id}-options`} role="listbox" className="coach-email-options" aria-label={`${label}搜索结果`}>
          {options.map((coach) => (
            <li key={coach.coachId}>
              <button
                type="button"
                role="option"
                aria-selected={selectedId === coach.coachId}
                onClick={() => {
                  onSelect(coach);
                  setQuery(coach.email);
                  setOptions([]);
                  setSearchCompleted(false);
                }}
              >
                <span className="coach-email-option-primary">{coach.email}</span>
                <span className="coach-email-option-meta">
                  {coach.name ?? "姓名未填写"} · {coach.phone ?? "手机号未填写"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
