import { useCallback, useEffect, useState } from "react";
import { ApiError, PROFILES, listVMs, startVM, stopVM, type VM } from "../api";

interface Props {
  selected: string | null;
  onSelect: (name: string | null) => void;
}

const POLL_MS = 3000;

function errorText(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return "Unauthorized: enter a valid API token (top right).";
  return e instanceof Error ? e.message : String(e);
}

export default function Dashboard({ selected, onSelect }: Props) {
  const [vms, setVms] = useState<VM[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("default");
  const [profile, setProfile] = useState<string>("default");
  const [memory, setMemory] = useState("2G");
  const [cpus, setCpus] = useState(2);
  const [vnc, setVnc] = useState(":1");
  const [sshPort, setSshPort] = useState(2222);
  const [headless, setHeadless] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setVms(await listVMs());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const vm = await startVM({ name, profile, memory, cpus, vnc, ssh_port: sshPort, headless });
      onSelect(vm.name);
      setError(null);
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (vmName: string) => {
    setBusy(true);
    try {
      await stopVM(vmName);
      if (selected === vmName) onSelect(null);
      setError(null);
      await refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Virtual machines</h2>
      {error && <p className="error" role="alert">{error}</p>}

      {vms.length === 0 ? (
        <p className="muted">No VMs running.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>PID</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vms.map((vm) => (
              <tr key={vm.name} className={vm.name === selected ? "selected" : undefined}>
                <td>{vm.name}</td>
                <td>{vm.pid}</td>
                <td>{new Date(vm.started_at).toLocaleString()}</td>
                <td className="actions">
                  <button onClick={() => onSelect(vm.name)}>Logs</button>
                  <button className="danger" disabled={busy} onClick={() => void stop(vm.name)}>
                    Stop
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Start a VM</h3>
      <form className="grid" onSubmit={start}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,62}" required />
        </label>
        <label>
          Profile
          <select value={profile} onChange={(e) => setProfile(e.target.value)}>
            {PROFILES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Memory
          <input value={memory} onChange={(e) => setMemory(e.target.value)} pattern="[1-9][0-9]{0,3}[MG]" title="For example 512M or 6G" required />
        </label>
        <label>
          CPUs
          <input type="number" min={1} max={64} value={cpus} onChange={(e) => setCpus(Number(e.target.value))} required />
        </label>
        <label>
          VNC display
          <input value={vnc} onChange={(e) => setVnc(e.target.value)} pattern=":[0-9]{1,2}" title="For example :1 (port 5901)" required />
        </label>
        <label>
          SSH forward port
          <input type="number" min={1024} max={65535} value={sshPort} onChange={(e) => setSshPort(Number(e.target.value))} required />
        </label>
        <label className="check">
          <input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} />
          Headless (serial console only)
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Working..." : "Start"}
        </button>
      </form>
    </section>
  );
}
