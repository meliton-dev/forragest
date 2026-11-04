import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getToken } from './lib/api';
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
import { Perfil } from './pages/Perfil';
import { RouteHome } from './pages/RouteHome';
import { Sync } from './pages/Sync';
import { Ayuda } from './pages/Ayuda';
import { Onboarding } from './ui/Onboarding';
import { GpsPrimer, Toaster } from './ui/Overlays';

/** Comparte la ubicación del camión mientras la ruta esté en curso. */
function Tracker() {
  const s = useStore();
  const gps = usePref('gps');
  const id = s.route?.status === 'EN_CURSO' ? s.route.id : null;
  const allowed = gps === '1';
  useEffect(() => {
    if (id && allowed) void startTracking(id);
    else stopTracking();
  }, [id, allowed]);
  // se explica para qué sirve antes de que el sistema pida el permiso (que solo se muestra una vez)
  return <AnimatePresence>{id && gps === null && <GpsPrimer key="primer" onAccept={() => writePref('gps', '1')} onDecline={() => writePref('gps', '0')} />}</AnimatePresence>;
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
    <motion.div key={loc.pathname} className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
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
        <Route path="/sync" element={<Sync />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="/cierre" element={<Cierre />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </motion.div>
  );
}

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
      <MotionConfig reducedMotion="user">
        <div className="app">
          <Login onDone={() => setAuth(true)} />
        </div>
      </MotionConfig>
    );
  }
  return (
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
  );
}
