import { lazy, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { clearSession, getToken, getUser } from './lib/api';
import { BackShell } from './pages/back/BackShell';
import { Corte } from './pages/Corte';
import { Devoluciones } from './pages/Devoluciones';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { Venta } from './pages/Venta';
import { VentasDia } from './pages/VentasDia';
import { PosProvider } from './pos-context';

// La oficina (rutas, mapa y compras) se carga al entrar a ella: el punto de venta abre sin bajar el mapa (Leaflet)
// ni pantallas que el cajero nunca usa. Patrón de React Router con React.lazy.
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const Eficiencia = page(() => import('./pages/back/Eficiencia'), 'Eficiencia');
const Monitoreo = page(() => import('./pages/back/Monitoreo'), 'Monitoreo');
const NuevaOrden = page(() => import('./pages/back/NuevaOrden'), 'NuevaOrden');
const NuevaRuta = page(() => import('./pages/back/NuevaRuta'), 'NuevaRuta');
const Ordenes = page(() => import('./pages/back/Ordenes'), 'Ordenes');
const PorPagar = page(() => import('./pages/back/PorPagar'), 'PorPagar');
const Precios = page(() => import('./pages/back/Precios'), 'Precios');
const Proveedores = page(() => import('./pages/back/Proveedores'), 'Proveedores');
const RutasLista = page(() => import('./pages/back/RutasLista'), 'RutasLista');
const Sugerencias = page(() => import('./pages/back/Sugerencias'), 'Sugerencias');

// Qué ve cada perfil: el cajero el punto de venta, el supervisor de rutas el módulo de rutas y el administrador ambos.
const canPos = (role?: string) => role === 'CAJERO' || role === 'ADMINISTRADOR';
const canRoutes = (role?: string) => role === 'SUPERVISOR_RUTAS' || role === 'ADMINISTRADOR';
const canPurchasing = (role?: string) => role === 'GERENTE_COMPRAS' || role === 'ADMINISTRADOR';

export default function App() {
  const [auth, setAuth] = useState(!!getToken());

  useEffect(() => {
    const out = () => {
      clearSession();
      setAuth(false);
    };
    window.addEventListener('fw:unauthorized', out);
    return () => window.removeEventListener('fw:unauthorized', out);
  }, []);

  if (!auth) return <Login onDone={() => setAuth(true)} />;
  const role = getUser()?.role;
  const home = canPos(role) ? '/' : canRoutes(role) ? '/rutas' : '/compras';

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            canPos(role) ? (
              <PosProvider onLogout={() => setAuth(false)}>
                <Shell />
              </PosProvider>
            ) : (
              <Navigate to={home} replace />
            )
          }
        >
          <Route path="/" element={<Venta />} />
          <Route path="/ventas" element={<VentasDia />} />
          <Route path="/devoluciones" element={<Devoluciones />} />
          <Route path="/corte" element={<Corte />} />
        </Route>
        <Route path="/rutas" element={canRoutes(role) ? <BackShell /> : <Navigate to={home} replace />}>
          <Route index element={<RutasLista />} />
          <Route path="nueva" element={<NuevaRuta />} />
          <Route path="mapa" element={<Monitoreo />} />
          <Route path="eficiencia" element={<Eficiencia />} />
        </Route>
        <Route path="/compras" element={canPurchasing(role) ? <BackShell /> : <Navigate to={home} replace />}>
          <Route index element={<Ordenes />} />
          <Route path="nueva" element={<NuevaOrden />} />
          <Route path="sugerencias" element={<Sugerencias />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="por-pagar" element={<PorPagar />} />
          <Route path="precios" element={<Precios />} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
