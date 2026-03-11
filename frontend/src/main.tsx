import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initSDK } from "@/lib/fhe";

initSDK()
  .then(() => {
    createRoot(document.getElementById("root")!).render(<App />);
  })
  .catch((err) => {
    console.error("Failed to initialize FHE SDK:", err);
    // Still mount the app so non-FHE pages work
    // FHE operations will fail gracefully with their own error handling
    createRoot(document.getElementById("root")!).render(<App />);
  });