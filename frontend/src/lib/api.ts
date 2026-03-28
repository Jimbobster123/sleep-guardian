function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv !== undefined && String(fromEnv).trim() !== "") return String(fromEnv).trim();
  // Same-origin `/api/...` in dev: Vite proxies to the Express server (avoids CORS and mixed-origin issues).
  if (import.meta.env.DEV) return "";
  return "http://localhost:5001";
}

export const API_BASE_URL = resolveApiBaseUrl();

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
  const { token: _omit, ...init } = opts;
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

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    const hint =
      e instanceof TypeError
        ? API_BASE_URL
          ? `Cannot reach the API at ${API_BASE_URL}. Start the backend (npm run dev:backend from the repo root) or set VITE_API_BASE_URL.`
          : `Cannot reach the API (dev proxy to port 5001). Start the backend with npm run dev:backend from the repo root, or set VITE_DEV_API_PROXY if it runs elsewhere.`
        : String(e);
    throw new ApiError(hint, 0, e);
  }
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
