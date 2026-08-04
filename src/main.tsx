import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppProvider } from "./context/AppContext";
import { BASE_PATH } from "./lib/path";
import "./styles.css";

const basename = BASE_PATH.replace(/\/+$/, "") || undefined;

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter basename={basename}>
			<AppProvider>
				<App />
			</AppProvider>
		</BrowserRouter>
	</StrictMode>
);
