import { AnimatePresence, LazyMotion, MotionConfig, m } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { clearSession, getToken, getUser, SESSION_EVENT, setSession } from './lib/api';
import { init, useStore } from './lib/store';
import { usePref, writePref } from './lib/prefs';
import { startTracking, stopTracking } from './lib/tracking';
import { Carga } from './pages/Carga';
import { Cierre } from './pages/Cierre';
import { Cobros, NuevoCobro } from './pages/Cobros';
import { Entregar } from './pages/Entregar';
import { Incidencias, NuevaIncidencia } from './pages/Incidencias';
import { Login } from './pages/Login';
import { NoEntrega } from './pages/NoEntrega';
import { Parada } from './pages/Parada';
import { CambiarPassword, ForcePassword } from './pages/Password';
import { Perfil } from './pages/Perfil';
import { RouteHome } from './pages/RouteHome';
import { Ayuda } from './pages/Ayuda';
import { Onboarding } from './ui/Onboarding';
import { GpsNotice, Toaster } from './ui/Overlays';

/** Motion completo pesa ~43 KB; con LazyMotion + m la primera carga es mínima y el resto llega después (motion.dev). */
const loadMotion = () => import('./lib/motion-features').then((r) => r.default);

/**
 * Comparte la ubicación del camión siempre que la ruta esté en curso, sin interruptor. La primera vez se le avisa al
 * chofer qué se comparte y cuándo; después el teléfono pide su permiso de ubicación (eso no se puede saltar).
 */
function Tracker() {
  const s = useStore();
  const informed = usePref('gpsNotice') === '1';
  const id = s.route?.status === 'EN_CURSO' ? s.route.id : null;
  useEffect(() => {
    if (id && informed) void startTracking(id);
    else stopTracking();
  }, [id, informed]);
  return <AnimatePresence>{id && !informed && <GpsNotice key="gps-notice" onClose={() => writePref('gpsNotice', '1')} />}</AnimatePresence>;
}

/** Tutorial de bienvenida: solo la primera vez que entra cada usuario. */
function FirstRun() {
  const done = usePref('onboarded');
  return <AnimatePresence>{!done && <Onboarding key="onboarding" onClose={() => writePref('onboarded', '1')} />}</AnimatePresence>;
}

/** Cada pantalla entra con un fundido y un leve desplazamiento. */
function AnimatedRoutes() {
  const loc = useLocation();
  return (
    <m.div
      key={loc.pathname}
      className="page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <Routes location={loc}>
        <Route path="/" element={<RouteHome />} />
        <Route path="/carga" element={<Carga />} />
        <Route path="/parada/:id" element={<Parada />} />
        <Route path="/parada/:id/entregar" element={<Entregar />} />
        <Route path="/parada/:id/no-entrega" element={<NoEntrega />} />
        <Route path="/cobros" element={<Cobros />} />
        <Route path="/cobros/nuevo" element={<NuevoCobro />} />
        <Route path="/incidencias" element={<Incidencias />} />
        <Route path="/incidencias/nueva" element={<NuevaIncidencia />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/perfil/contrasena" element={<CambiarPassword />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="/cierre" element={<Cierre />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </m.div>
  );
}

export default function App() {
  // la sesión vive en localStorage; este contador repinta la pantalla cuando cambia (entrar, salir, nueva contraseña)
  const [, setVersion] = useState(0);
  const auth = !!getToken();
  const user = getUser();
  const mustChange = auth && user?.mustChangePassword === true;

  useEffect(() => {
    const again = () => setVersion((v) => v + 1);
    // el servidor dijo que hay que elegir contraseña antes de seguir: se muestra esa pantalla (la cola pendiente no se toca)
    const required = () => {
      const token = getToken();
      const u = getUser();
      if (token && u && !u.mustChangePassword) setSession(token, { ...u, mustChangePassword: true });
    };
    window.addEventListener('fd:loggedout', again);
    window.addEventListener(SESSION_EVENT, again);
    window.addEventListener('fd:password-required', required);
    return () => {
      window.removeEventListener('fd:loggedout', again);
      window.removeEventListener(SESSION_EVENT, again);
      window.removeEventListener('fd:password-required', required);
    };
  }, []);
  // solo se sincroniza con la sesión completa: al elegir contraseña se vuelve a llamar y se envía lo pendiente
  useEffect(() => {
    if (auth && !mustChange) void init();
  }, [auth, mustChange]);

  if (!auth || !user || mustChange) {
    return (
      <LazyMotion features={loadMotion} strict>
        <MotionConfig reducedMotion="user">
          <div className="app">
            {mustChange && user ? <ForcePassword user={user} onLogout={clearSession} /> : <Login onDone={() => setVersion((v) => v + 1)} />}
          </div>
        </MotionConfig>
      </LazyMotion>
    );
  }
  return (
    <LazyMotion features={loadMotion} strict>
      <MotionConfig reducedMotion="user">
        <div className="app">
          <Tracker />
          <Toaster />
          <FirstRun />
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
