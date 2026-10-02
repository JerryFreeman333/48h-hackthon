export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message ?? `请求失败 (${response.status})`);
  if (result === null) throw new Error("接口没有返回有效 JSON");
  return result as T;
}

export function formPayload(form: HTMLFormElement) {
  const raw = Object.fromEntries(new FormData(form).entries());
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    result[key] = ["salaryMin", "salaryMax", "salaryMonths"].includes(key) ? Number(text) : key === "publishedAt" && /^\d{4}-\d{2}-\d{2}$/u.test(text) ? `${text}T00:00:00Z` : text;
  }
  return result;
}
