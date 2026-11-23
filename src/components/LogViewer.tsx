import { useEffect, useRef, useState } from "react";
import { logsUrl } from "../api";

const MAX_CHARS = 200_000;

export default function LogViewer({ name }: { name: string | null }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setText("");
    if (!name) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");
    const ws = new WebSocket(logsUrl(name));
    ws.onopen = () => setStatus("open");
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (ev: MessageEvent<string>) =>
      setText((prev) => (prev + ev.data).slice(-MAX_CHARS));
    return () => {
      ws.onclose = null;
      ws.close();
    };
  }, [name]);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <section className="card">
      <div className="row">
        <h2>Logs{name ? `: ${name}` : ""}</h2>
        <span className={`badge ${status}`}>{status}</span>
      </div>
      {name ? (
        <pre ref={preRef} className="logs">{text || "Waiting for output..."}</pre>
      ) : (
        <p className="muted">Select a VM to stream its log.</p>
      )}
    </section>
  );
}
