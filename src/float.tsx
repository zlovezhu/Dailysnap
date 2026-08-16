import React from "react";
import ReactDOM from "react-dom/client";
import { FloatBall } from "./components/FloatBall";
import "./styles/float.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FloatBall />
  </React.StrictMode>
);
