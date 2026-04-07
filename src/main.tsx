import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.lang = "he";
document.documentElement.dir = "rtl";
document.body.dir = "rtl";

createRoot(document.getElementById("root")!).render(<App />);
