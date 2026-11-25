// Letras variables: un archivo por alfabeto con todos los grosores (antes, uno por grosor y en dos formatos).
// El navegador solo descarga el alfabeto que la página usa (latín).
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/nunito-sans/wght.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// Si se publica una versión nueva con la página abierta, las pantallas de oficina viejas ya no existen en el servidor:
// se recarga una vez para tomar la versión nueva (guía de Vite, "Load Error Handling"). La marca evita recargar en ciclo.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('fw.reloaded') === '1') return;
    sessionStorage.setItem('fw.reloaded', '1');
  } catch {
    // sin almacenamiento: se recarga igual
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  try {
    setTimeout(() => sessionStorage.removeItem('fw.reloaded'), 10_000);
  } catch {
    // nada que limpiar
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
