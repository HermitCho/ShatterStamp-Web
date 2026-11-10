import { defineConfig } from "vite";

// GitHub Pages 같은 하위 경로에서도 열리도록 상대 경로로 빌드한다.
export default defineConfig({
  base: "./",
  build: { target: "es2022", outDir: "dist" },
});
