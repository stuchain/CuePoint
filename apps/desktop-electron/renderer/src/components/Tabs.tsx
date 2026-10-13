import "./Tabs.css";

interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** `"page"` is the underline strip; `"sub"` is the quiet pill row inside a page (T8). */
  variant?: "page" | "sub";
}

export function Tabs({ tabs, activeId, onChange, variant = "page" }: TabsProps) {
  return (
    <div className={`cp-tabs ${variant === "sub" ? "cp-tabs--sub" : ""}`.trim()} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          className={`cp-tabs__tab ${tab.id === activeId ? "cp-tabs__tab--active" : ""}`}
          disabled={tab.disabled}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
