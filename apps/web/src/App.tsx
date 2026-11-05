import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { clearSession, getToken, getUser } from './lib/api';
import { BackShell } from './pages/back/BackShell';
import { Eficiencia } from './pages/back/Eficiencia';
import { Monitoreo } from './pages/back/Monitoreo';
import { NuevaOrden } from './pages/back/NuevaOrden';
import { NuevaRuta } from './pages/back/NuevaRuta';
import { Ordenes } from './pages/back/Ordenes';
import { PorPagar } from './pages/back/PorPagar';
import { Precios } from './pages/back/Precios';
import { Proveedores } from './pages/back/Proveedores';
import { RutasLista } from './pages/back/RutasLista';
import { Sugerencias } from './pages/back/Sugerencias';
import { Corte } from './pages/Corte';
import { Devoluciones } from './pages/Devoluciones';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { Venta } from './pages/Venta';
import { VentasDia } from './pages/VentasDia';
import { PosProvider } from './pos-context';

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
