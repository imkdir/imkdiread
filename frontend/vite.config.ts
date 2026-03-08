import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/imgs": "http://localhost:3001",
      "/files": "http://localhost:3001",
    },
  },
});
