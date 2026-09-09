import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5191,
    strictPort: true,
  },
  build: {
    target: "esnext",
    emptyOutDir: true,
  },
});
