import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { STATIC_PREVIEW } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

// GitHub Pages serves static files only, so deep links use the hash.
const routes = <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {STATIC_PREVIEW ? <HashRouter>{routes}</HashRouter> : <BrowserRouter>{routes}</BrowserRouter>}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
