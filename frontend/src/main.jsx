import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { UserAuthProvider } from "./context/UserAuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ToastProvider } from "./components/ui/Toaster";
import { DialogProvider } from "./components/ui/Dialog";
import { installAudioUnlock } from "./lib/sound";
import "./i18n";
import "./index.css";

installAudioUnlock();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ToastProvider>
          <DialogProvider>
            <AuthProvider>
              <UserAuthProvider>
                <App />
              </UserAuthProvider>
            </AuthProvider>
          </DialogProvider>
        </ToastProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
