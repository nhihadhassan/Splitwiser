import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Clerk's Vercel integration provides the conventional NEXT_PUBLIC_ key.
  // Keep VITE_ support for a local override without exposing server secrets.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react()],
});
