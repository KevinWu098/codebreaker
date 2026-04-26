import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app";
import "@/styles.css";

if (import.meta.env.DEV) {
  import("react-grab");
}

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root element in document");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
