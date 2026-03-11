// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react-swc";
// import path from "path";
// import { componentTagger } from "lovable-tagger";

// // https://vitejs.dev/config/
// export default defineConfig(({ mode }) => ({
//   server: {
//     host: "::",
//     port: 8080,
//     hmr: {
//       overlay: false,
//     },
//   },
//   plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
//   resolve: {
//     alias: {
//       "@": path.resolve(__dirname, "./src"),
//     },
//   },
// }));
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Required for SharedArrayBuffer used internally by the FHE SDK
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    // WASM plugin must come before react
    wasm(),
    topLevelAwait(),
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  optimizeDeps: {
    // Tell Vite NOT to pre-bundle the SDK — it handles its own WASM loading
    exclude: ["@zama-fhe/relayer-sdk"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure .wasm files are served correctly
  assetsInclude: ["**/*.wasm"],
}));