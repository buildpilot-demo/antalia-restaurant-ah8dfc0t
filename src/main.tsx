import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { convexUrl, siteId } from "./lib/convex";
import { applyTheme } from "./theme";
import { siteConfig } from "./site.config";
import "./styles.css";

applyTheme(siteConfig.palette);

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <ErrorBoundary>
      {/* The site renders with or without backend wiring; the enquiry form
          reports its own disconnected state when the Convex env vars are absent. */}
      {convexUrl ? (
        <ConvexProvider client={new ConvexReactClient(convexUrl)}>
          <BrowserRouter><App /></BrowserRouter>
        </ConvexProvider>
      ) : (
        <BrowserRouter><App /></BrowserRouter>
      )}
    </ErrorBoundary>
    {/* data-site-id keeps the tenant id present in the built bundle for deployment verification */}
    <span hidden data-site-id={siteId ?? ""} />
  </StrictMode>,
);
