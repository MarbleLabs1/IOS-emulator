import { Suspense, lazy, useState } from "react";
import Dashboard from "./components/Dashboard";
import LogViewer from "./components/LogViewer";
import Settings from "./components/Settings";

// Monaco is large; only load it when the editor is opened.
const Editor = lazy(() => import("./components/Editor"));

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  // Bumped when the token changes so the dashboard refetches immediately.
  const [authVersion, setAuthVersion] = useState(0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>QEMU Emulator Manager</h1>
        <Settings onChange={() => setAuthVersion((v) => v + 1)} />
      </header>
      <main>
        <Dashboard key={authVersion} selected={selected} onSelect={setSelected} />
        <LogViewer name={selected} />
        <section className="card">
          <div className="row">
            <h2>Editor</h2>
            <button onClick={() => setShowEditor((s) => !s)}>{showEditor ? "Hide" : "Show"}</button>
          </div>
          {showEditor && (
            <Suspense fallback={<p className="muted">Loading editor...</p>}>
              <Editor />
            </Suspense>
          )}
        </section>
      </main>
    </div>
  );
}
