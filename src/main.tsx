import React from "react";
import ReactDOM from "react-dom/client";
import "./global.css";

// import { Prov } from "@heroui/react";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
