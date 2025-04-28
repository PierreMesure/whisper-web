import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enJSON from "./locale/en.json";
import svJSON from "./locale/sv.json";
import noJSON from "./locale/no.json";
import esJSON from "./locale/es.json";

const resources = {
  en: { ...enJSON },
  sv: { ...svJSON },
  no: { ...noJSON },
  es: { ...esJSON },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "sv",
});

export const availableLanguages = Object.keys(resources);
export default i18n;
