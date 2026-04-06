import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ca from './ca.json';

i18n.use(initReactI18next).init({
  resources: { ca: { translation: ca } },
  lng: 'ca',
  fallbackLng: 'ca',
  interpolation: { escapeValue: false },
});

export default i18n;
