import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getToken } from './lib/api';
import { init } from './lib/store';
import { Carga } from './pages/Carga';
import { Cierre } from './pages/Cierre';
import { Cobros, NuevoCobro } from './pages/Cobros';
import { Entregar } from './pages/Entregar';
import { Incidencias, NuevaIncidencia } from './pages/Incidencias';
import { Login } from './pages/Login';
import { NoEntrega } from './pages/NoEntrega';
import { Parada } from './pages/Parada';
import { Perfil } from './pages/Perfil';
import { RouteHome } from './pages/RouteHome';
import { Sync } from './pages/Sync';

export default function App() {
  const [auth, setAuth] = useState(!!getToken());

  useEffect(() => {
    const out = () => setAuth(false);
    window.addEventListener('fd:loggedout', out);
    return () => window.removeEventListener('fd:loggedout', out);
  }, []);
  useEffect(() => {
    if (auth) void init();
  }, [auth]);

  if (!auth) {
    return (
      <div className="app">
        <Login onDone={() => setAuth(true)} />
      </div>
    );
  }
  return (
    <div className="app">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RouteHome />} />
          <Route path="/carga" element={<Carga />} />
          <Route path="/parada/:id" element={<Parada />} />
          <Route path="/parada/:id/entregar" element={<Entregar />} />
          <Route path="/parada/:id/no-entrega" element={<NoEntrega />} />
          <Route path="/cobros" element={<Cobros />} />
          <Route path="/cobros/nuevo" element={<NuevoCobro />} />
          <Route path="/incidencias" element={<Incidencias />} />
          <Route path="/incidencias/nueva" element={<NuevaIncidencia />} />
          <Route path="/sync" element={<Sync />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/cierre" element={<Cierre />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
