import { useState } from 'react';
import { request, setSession, type SessionUser } from '../lib/api';
import { ApiError, NetworkError } from '@forrajera/shared';
import { Button, Field, Input, Notice } from '../ui/kit';

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
      <div className="login-top">
        <div className="row gap12">
          <img className="logo" src="/icon.svg" alt="" width={44} height={44} />
          <div className="wordmark">
            Forragest
            <small>Reparto</small>
          </div>
        </div>
        <h1 className="lema">
          Buen camino,
          <br />
          <em>chofer</em>.
        </h1>
        <svg className="art" viewBox="0 0 375 120" aria-hidden>
          <circle cx="300" cy="40" r="26" fill="#e9b949" />
          <path d="M0 78c60-26 120-28 190-12s120 10 185-14v68H0z" fill="#2f6a4f" />
          <path d="M0 100c70-22 140-18 210-4s110 8 165-12v36H0z" fill="#3f7f5e" />
          <g>
            <rect x="196" y="66" width="50" height="22" rx="4" fill="#f4efe4" />
            <rect x="232" y="56" width="24" height="32" rx="5" fill="#b8482f" />
            <circle cx="210" cy="91" r="7" fill="#17382b" />
            <circle cx="244" cy="91" r="7" fill="#17382b" />
          </g>
        </svg>
      </div>
      <div className="col login-body" style={{ gap: 16 }}>
        <Field label="Usuario">
          <Input
            icon="user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ej. mdiaz"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />
        </Field>
        <Field
          label="Contraseña"
          link={
            <button type="button" className="link small" onClick={() => setShow(!show)}>
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          }
        >
          <Input
            icon="lock"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>
        {error && (
          <Notice tone="danger" icon="alert">
            {error}
          </Notice>
        )}
        <Button type="submit" loading={busy} disabled={!username || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <Notice tone="info">Después de iniciar sesión podrás trabajar sin conexión; tus registros se envían al recuperar señal.</Notice>
      </div>
    </form>
  );
}
