import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./css/index.css";
import './i18n.ts'

// Analytics
const goatCounterUrl = import.meta.env.VITE_GOATCOUNTER_URL;
if (goatCounterUrl && !document.getElementById("goatcounter-script")) {
    const script = document.createElement("script");
    script.id = "goatcounter-script";
    script.dataset.goatcounter = goatCounterUrl;
    script.async = true;
    script.src = "//gc.zgo.at/count.js";
    document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
