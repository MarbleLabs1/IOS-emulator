// Thin client for the Go manager API (see linux-emulator-server/cmd/manager).

export interface VM {
  name: string;
  pid: number;
  started_at: string;
}

export interface StartOptions {
  name: string;
  profile?: string;
  memory?: string;
  cpus?: number;
  vnc?: string;
  ssh_port?: number;
  headless?: boolean;
}

export interface FileEntry {
  path: string;
  is_dir: boolean;
}

export const PROFILES = ["default", "max"] as const;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TOKEN_KEY = "manager-token";

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the token only lives until the page reloads */
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the manager API. Is it running?");
  }
  if (!res.ok) {
    let message = res.statusText;
    const text = await res.text();
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? message;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listVMs(): Promise<VM[]> {
  return (await request("/api/v1/vm/list")).json();
}

export async function startVM(opts: StartOptions): Promise<VM> {
  return (await request("/api/v1/vm/start", json(opts))).json();
}

export async function stopVM(name: string): Promise<void> {
  await request("/api/v1/vm/stop", json({ name }));
}

export function logsUrl(name: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const params = new URLSearchParams({ name });
  const token = getToken();
  if (token) params.set("token", token);
  return `${proto}://${location.host}/api/v1/ws/logs?${params}`;
}

export async function readFile(path: string): Promise<string> {
  return (await request(`/api/v1/ide/read?${new URLSearchParams({ path })}`)).text();
}

export async function writeFile(path: string, content: string): Promise<void> {
  await request(`/api/v1/ide/write?${new URLSearchParams({ path })}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: content,
  });
}

export async function buildFile(path: string, out: string): Promise<string> {
  return (await request("/api/v1/ide/build", json({ path, out }))).text();
}
