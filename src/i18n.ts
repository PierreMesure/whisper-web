import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: { 
    translation: {
      appName: "RunAnywhere Voice Pipeline"
    }
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export const availableLanguages = Object.keys(resources);
export default i18n;
