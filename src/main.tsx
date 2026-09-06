import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installEdgeErrorEnrichment } from "./lib/edgeErrors";

installEdgeErrorEnrichment();

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";
document.body.dir = "rtl";

// Set the app shell height before React's first paint. iOS home-screen
// shortcuts can report a stale visualViewport height while launching.
document.documentElement.style.setProperty("--app-height", `${Math.round(window.innerHeight)}px`);

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

