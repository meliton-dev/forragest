import { useState } from 'react';
import { request, setSession, type SessionUser } from '../lib/api';
import { ApiError, NetworkError } from '../lib/errors';
import { Button, Field, Icon, Input, Notice } from '../ui/kit';

export function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <form className="screen login" onSubmit={submit}>
      <div className="col gap12">
        <div className="logo">
          <Icon name="leaf" size={26} sw={2} />
        </div>
        <div>
          <h1 className="h1">Forrajera Repartos</h1>
          <div className="small muted">Ingresa con tu usuario de chofer</div>
        </div>
      </div>
      <div className="col gap12" style={{ gap: 16 }}>
        <Field label="Usuario">
          <Input icon="user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej. mdiaz" autoCapitalize="none" autoCorrect="off" autoComplete="username" required />
        </Field>
        <Field
          label="Contraseña"
          link={
            <button type="button" className="link small" onClick={() => setShow(!show)}>
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          }
        >
          <Input icon="lock" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
        </Field>
        {error && <Notice tone="danger" icon="alert">{error}</Notice>}
        <Button type="submit" disabled={busy || !username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </div>
      <Notice tone="info">Después de iniciar sesión podrás trabajar sin conexión; tus registros se envían al recuperar señal.</Notice>
    </form>
  );
}
