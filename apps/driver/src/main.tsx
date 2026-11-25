// Letras variables: un archivo por alfabeto con todos los grosores (antes, uno por grosor y en dos formatos).
// El navegador solo descarga el alfabeto que la página usa (latín).
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/nunito-sans/wght.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

// actualiza solo la app instalada cuando hay una versión nueva
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
