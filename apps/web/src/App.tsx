import { lazy, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api, clearSession, getToken, getUser, SESSION_EVENT, setSession, type SessionUser } from './lib/api';
import { BackShell } from './pages/back/BackShell';
import { Corte } from './pages/Corte';
import { Devoluciones } from './pages/Devoluciones';
import { Login } from './pages/Login';
import { ForcePassword } from './pages/Password';
import { Shell } from './pages/Shell';
import { SinPantallas } from './pages/SinPantallas';
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
const Usuarios = page(() => import('./pages/back/Usuarios'), 'Usuarios');
const Ventas = page(() => import('./pages/back/Ventas'), 'Ventas');

// Qué ve cada perfil: el cajero el punto de venta, el supervisor de rutas el módulo de rutas y el administrador la oficina.
const canPos = (role?: string) => role === 'CAJERO';
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
  const home = canPos(role) ? '/' : role === 'ADMINISTRADOR' ? '/oficina/ventas' : canRoutes(role) ? '/rutas' : '/compras';

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
        <Route path="/oficina/ventas" element={role === 'ADMINISTRADOR' ? <BackShell /> : <Navigate to={home} replace />}>
          <Route index element={<Ventas />} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
