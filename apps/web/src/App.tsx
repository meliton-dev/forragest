import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api, clearSession, getToken, getUser, SESSION_EVENT, setSession, type SessionUser } from './lib/api';
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
import { Usuarios } from './pages/back/Usuarios';
import { Corte } from './pages/Corte';
import { Devoluciones } from './pages/Devoluciones';
import { Login } from './pages/Login';
import { ForcePassword } from './pages/Password';
import { Shell } from './pages/Shell';
import { SinPantallas } from './pages/SinPantallas';
import { Venta } from './pages/Venta';
import { VentasDia } from './pages/VentasDia';
import { PosProvider } from './pos-context';

// Qué ve cada perfil: el cajero el punto de venta, el supervisor de rutas el módulo de rutas y el administrador ambos.
const canPos = (role?: string) => role === 'CAJERO' || role === 'ADMINISTRADOR';
const canRoutes = (role?: string) => role === 'SUPERVISOR_RUTAS' || role === 'ADMINISTRADOR';
const canPurchasing = (role?: string) => role === 'GERENTE_COMPRAS' || role === 'ADMINISTRADOR';

export default function App() {
  // la sesión vive en localStorage; este contador hace que la pantalla se repinte cuando cambia (entrar, salir, nueva contraseña)
  const [, setVersion] = useState(0);
  const auth = !!getToken();

  useEffect(() => {
    const out = () => clearSession();
    const again = () => setVersion((v) => v + 1);
    // el servidor dijo que hay que elegir contraseña antes de seguir: se muestra esa pantalla
    const mustChange = () => {
      const token = getToken();
      const user = getUser();
      if (token && user && !user.mustChangePassword) setSession(token, { ...user, mustChangePassword: true });
    };
    window.addEventListener('fw:unauthorized', out);
    window.addEventListener('fw:password-required', mustChange);
    window.addEventListener(SESSION_EVENT, again);
    // al abrir se confirma con el servidor quién es y si debe cambiar su contraseña
    if (getToken()) {
      api<SessionUser>('GET', '/auth/me')
        .then((me) => {
          const token = getToken();
          if (token) setSession(token, me);
        })
        .catch(() => undefined);
    }
    return () => {
      window.removeEventListener('fw:unauthorized', out);
      window.removeEventListener('fw:password-required', mustChange);
      window.removeEventListener(SESSION_EVENT, again);
    };
  }, []);

  const user = getUser();
  if (!auth || !user) return <Login onDone={() => setVersion((v) => v + 1)} />;
  if (user.mustChangePassword) return <ForcePassword user={user} onLogout={clearSession} />;
  const role = user.role;
  if (!canPos(role) && !canRoutes(role) && !canPurchasing(role)) return <SinPantallas user={user} onLogout={clearSession} />;
  const home = canPos(role) ? '/' : canRoutes(role) ? '/rutas' : '/compras';

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            canPos(role) ? (
              <PosProvider onLogout={() => undefined}>
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
        <Route path="/usuarios" element={role === 'ADMINISTRADOR' ? <BackShell /> : <Navigate to={home} replace />}>
          <Route index element={<Usuarios />} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
