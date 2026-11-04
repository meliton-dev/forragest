import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { clearSession, getToken } from './lib/api';
import { Corte } from './pages/Corte';
import { Devoluciones } from './pages/Devoluciones';
import { Login } from './pages/Login';
import { Shell } from './pages/Shell';
import { Venta } from './pages/Venta';
import { VentasDia } from './pages/VentasDia';
import { PosProvider } from './pos-context';

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
  return (
    <PosProvider onLogout={() => setAuth(false)}>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<Venta />} />
            <Route path="/ventas" element={<VentasDia />} />
            <Route path="/devoluciones" element={<Devoluciones />} />
            <Route path="/corte" element={<Corte />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PosProvider>
  );
}
