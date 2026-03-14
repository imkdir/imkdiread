import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "motion-vendor": ["framer-motion"],
          "masonry-vendor": ["react-masonry-css"],
          "csv-vendor": ["papaparse"],
        },
      },
    },
  },
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/imgs": "http://localhost:3001",
      "/files": "http://localhost:3001",
    },
  },
});
