import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "@/app";
import { queryClient } from "@/lib/query-client";
import "@/styles.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root element in document");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        closeButton
        position="bottom-right"
        richColors
        theme="system"
        toastOptions={{
          classNames: {
            toast:
              "!bg-bg-raised !border-border !text-fg !text-xs !font-mono !rounded",
          },
        }}
      />
      {import.meta.env.DEV && (
        <ReactQueryDevtools
          buttonPosition="bottom-left"
          initialIsOpen={false}
        />
      )}
    </QueryClientProvider>
  </StrictMode>
);
