import { useState } from 'react';
import { request, setSession, wasExpired, type SessionUser } from '../lib/api';
import { ApiError, NetworkError } from '@forrajera/shared';
import { AuthTop } from '../ui/AuthTop';
import { Button, EyeToggle, Field, Input, Notice } from '../ui/kit';

/** Lo que dura la salida (igual que la transición `.auth.leaving` de styles.css). */
const LEAVE_MS = 320;

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  // si la sesión terminó sola (p. ej. le cambiaron la contraseña) se explica y se avisa que lo guardado se conserva
  const [expired] = useState(wasExpired);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { username: username.trim(), password });
      if (res.user.role !== 'CHOFER') {
        setError('Esta aplicación es solo para repartidores.');
        return;
      }
      // la pantalla se desvanece antes de pasar a la ruta
      setLeaving(true);
      await new Promise((r) => setTimeout(r, LEAVE_MS));
      setSession(res.accessToken, res.user);
      onDone();
    } catch (err) {
      if (err instanceof NetworkError) setError('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
      else if (err instanceof ApiError && err.status === 401) setError('Usuario o contraseña incorrectos.');
      else setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`screen login auth ${leaving ? 'leaving' : ''}`} onSubmit={submit}>
      <AuthTop title="Control de tus entregas" text="Ruta del día, cobros e incidencias en un solo lugar." />
      <div className="col login-body" style={{ gap: 16 }}>
        <div>
          <h2 className="h1">Iniciar sesión</h2>
          <div className="small muted">Ingresa con el usuario que te asignó la administración.</div>
        </div>
        <Field label="Usuario">
          <Input
            icon="user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nombre de usuario"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </Field>
        <Field label="Contraseña">
          <Input
            icon="lock"
            type={show ? 'text' : 'password'}
            suffix={<EyeToggle shown={show} onToggle={() => setShow(!show)} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
            required
          />
        </Field>
        {expired && !error && (
          <Notice tone="warn" icon="alert">
            Tu sesión terminó (puede que te hayan cambiado la contraseña). Entra de nuevo: lo que ya registraste no se pierde.
          </Notice>
        )}
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
        <Button type="submit" loading={busy} disabled={!username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </div>
    </form>
  );
}
