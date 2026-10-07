import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/vibe_blackjack/",
  plugins: [react()],
});
