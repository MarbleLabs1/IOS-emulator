import { useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import { ApiError, buildFile, readFile, writeFile } from "../api";

function describe(e: unknown): string {
  if (e instanceof ApiError && e.status === 404) {
    return "Editor API not available. Start the manager with IDE_ENABLED=true and MANAGER_TOKEN set.";
  }
  if (e instanceof ApiError && e.status === 401) return "Unauthorized: enter a valid API token (top right).";
  return e instanceof Error ? e.message : String(e);
}

/** Minimal remote editor. Paths are relative to the manager's IDE_ROOT. */
export default function Editor() {
  const [path, setPath] = useState("project/main.swift");
  const [code, setCode] = useState("// Open a file to edit it");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = async (action: () => Promise<string | void>) => {
    try {
      const text = await action();
      setMessage({ kind: "ok", text: text || "Done" });
    } catch (e) {
      setMessage({ kind: "error", text: describe(e) });
    }
  };

  return (
    <div className="editor">
      <div className="row">
        <input value={path} onChange={(e) => setPath(e.target.value)} aria-label="File path" />
        <button onClick={() => void run(async () => { setCode(await readFile(path)); return `Opened ${path}`; })}>Open</button>
        <button onClick={() => void run(async () => { await writeFile(path, code); return `Saved ${path}`; })}>Save</button>
        <button onClick={() => void run(() => buildFile(path, path.replace(/\.[^./]+$/, "") || "app"))}>Build</button>
      </div>
      {message && <p className={message.kind === "error" ? "error" : "muted"} role="status">{message.text}</p>}
      <MonacoEditor height="55vh" defaultLanguage="swift" theme="vs-dark" value={code} onChange={(v) => setCode(v ?? "")} />
    </div>
  );
}
