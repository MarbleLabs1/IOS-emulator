import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The Go manager serves the API on :8080 (see linux-emulator-server/cmd/manager).
const API_TARGET = process.env.MANAGER_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    // Do not set changeOrigin: the manager only accepts same-origin WebSockets.
    proxy: {
      "/api": { target: API_TARGET, ws: true },
    },
  },
});
