import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// Set PREVIEW_PROXY=1 when the dev server sits behind an HTTPS reverse proxy
// (e.g. a hosted preview/sandbox) so HMR upgrades over wss on port 443.
const behindHttpsProxy = process.env.PREVIEW_PROXY === "1";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    // Preview hosts are dynamic (e.g. *.e2b.app), so accept any Host header.
    allowedHosts: true,
    ...(behindHttpsProxy ? { hmr: { protocol: "wss", clientPort: 443 } } : {}),
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
  },
  plugins: [react(), mode === "development" && componentTagger(), mcpPlugin()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
