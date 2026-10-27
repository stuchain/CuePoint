/**
 * Which panels are shown, told to main so View › Track details and View › Sidebar carry a tick
 * (M497). The sidebar and Track details each report their own half; main gets both every time.
 */
type ViewState = { inspector: boolean; sidebar: boolean };

let current: ViewState = { inspector: false, sidebar: true };
let sent: string | null = null;

export function reportViewState(part: Partial<ViewState>): void {
  current = { ...current, ...part };
  const key = `${current.inspector}/${current.sidebar}`;
  if (key === sent) return;
  sent = key;
  void window.cuepoint?.menu?.setViewState?.(current)?.catch(() => undefined);
}
