export function loadSettings<T>(key: string, defaults: T): T {
  try {
    // 兼容旧项目名 rd-compress -> redon-compress 迁移
    let raw = localStorage.getItem(key);
    if (!raw && key.startsWith("redon-compress:")) {
      raw = localStorage.getItem(key.replace("redon-compress:", "rd-compress:"));
    }
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveSettings<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
