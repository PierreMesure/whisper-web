import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./css/index.css";
import './i18n.ts'

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
