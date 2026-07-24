import React from "react";
import ReactDOM from "react-dom/client";
import { MiniChat } from "./components/MiniChat";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MiniChat />
  </React.StrictMode>
);
