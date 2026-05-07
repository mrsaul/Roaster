import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Disable lightningcss for CSS minification (native binary missing on this machine)
    // Fall back to esbuild-based CSS minification which needs no native binaries
    cssMinify: "esbuild",
  },
  define: {
    // client.ts expects VITE_SUPABASE_ANON_KEY but .env provides VITE_SUPABASE_PUBLISHABLE_KEY
    ...(process.env.VITE_SUPABASE_ANON_KEY
      ? {}
      : {
          "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""
          ),
        }),
  },
}));
