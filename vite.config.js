import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works at https://<user>.github.io/<any-repo>/
  // without hardcoding the repository name. Use "/" instead only for a custom
  // domain or a user/org site (a repo literally named <user>.github.io).
  base: "./",
  build: {
    rollupOptions: {
      output: {
        // Charts are ~70% of the bundle and change far less often than the
        // app does, so splitting them keeps repeat visits cheap.
        manualChunks: {
          react: ["react", "react-dom"],
          charts: ["recharts"],
        },
      },
    },
  },
});
