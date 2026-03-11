export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiJson<T>(
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers = new Headers(opts.headers || {});
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && opts.body) {
    // Most calls send JSON. If a caller wants a different type (e.g. ICS), they pass Content-Type explicitly.
    const body: any = opts.body as any;
    const isNonJsonBody =
      typeof FormData !== "undefined" && body instanceof FormData
        ? true
        : typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams
          ? true
          : typeof Blob !== "undefined" && body instanceof Blob
            ? true
            : false;
    if (!isNonJsonBody) headers.set("Content-Type", "application/json");
  }
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);

  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  const data = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const msg = (data && typeof data === "object" && "error" in data && String((data as any).error)) || res.statusText;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
