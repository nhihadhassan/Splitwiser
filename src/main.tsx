import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { legacyHashDestination } from "./routing";
import "./styles.css";
import "./cloud.css";

const legacyDestination = legacyHashDestination(
  window.location.pathname,
  window.location.search,
  window.location.hash,
);
if (legacyDestination) window.history.replaceState(null, "", legacyDestination);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
