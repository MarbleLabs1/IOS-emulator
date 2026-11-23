import { useState } from "react";
import { getToken, setToken } from "../api";

interface Props {
  onChange: () => void;
}

/** Stores the manager access token (MANAGER_TOKEN on the server). */
export default function Settings({ onChange }: Props) {
  const [value, setValue] = useState(getToken());
  const [saved, setSaved] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setToken(value.trim());
    setSaved(true);
    onChange();
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <form className="settings" onSubmit={save}>
      <label htmlFor="token">API token</label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        placeholder="MANAGER_TOKEN"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit">{saved ? "Saved" : "Save"}</button>
    </form>
  );
}
