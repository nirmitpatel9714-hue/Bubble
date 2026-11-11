import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root,
  resolve: { alias: { "@": path.resolve(root, "../../src") } },
  define: {
    __LOSOS_IPC_BASE_URL__: JSON.stringify(process.env.LOSOS_IPC_BASE_URL),
    __LOSOS_IPC_TREE__: JSON.stringify(process.env.LOSOS_IPC_TREE),
  },
  build: {
    target: "es2022",
    outDir: process.env.LOSOS_IPC_DIST,
    emptyOutDir: true,
  },
});
