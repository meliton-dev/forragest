import { useState } from 'react';
import { api, setSession, type SessionUser } from '../lib/api';
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
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { username: username.trim(), password });
      if (!['CAJERO', 'ADMINISTRADOR', 'SUPERVISOR_RUTAS', 'GERENTE_COMPRAS'].includes(res.user.role)) {
        setError('Tu perfil no tiene acceso a esta aplicación.');
        return;
      }
      setSession(res.accessToken, res.user);
      onDone();
    } catch (err) {
      if (err instanceof NetworkError) setError('No hay conexión con el servidor. Intenta de nuevo.');
      else if (err instanceof ApiError && err.status === 401) setError('Usuario o contraseña incorrectos.');
      else setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="row gap12">
          <img src="/icon.svg" alt="" width={44} height={44} style={{ borderRadius: 6 }} />
          <div className="wordmark">
            Forragest
            <small>Sistema de la forrajera</small>
          </div>
        </div>
        <div className="col gap16">
          <p className="lema">
            Del almacén
            <br />
            al <em>corral</em>.
          </p>
          <p className="sub">Mostrador, reparto y compras de la forrajera en un solo lugar.</p>
        </div>
        <svg className="art" viewBox="0 0 640 260" aria-hidden>
          <circle cx="500" cy="78" r="44" fill="#e9b949" />
          <path d="M0 170c90-46 190-52 300-22s220 20 340-26v138H0z" fill="#2f6a4f" />
          <path d="M0 206c120-40 240-34 360-8s190 14 280-22v84H0z" fill="#3f7f5e" />
          <g fill="#f4efe4">
            <rect x="92" y="150" width="74" height="62" rx="4" />
            <path d="M84 152 129 112l45 40z" fill="#b8482f" />
            <rect x="118" y="176" width="22" height="36" fill="#1f4d3a" />
          </g>
          <g fill="#e9b949" stroke="#1f4d3a" strokeWidth="3">
            <rect x="214" y="176" width="40" height="46" rx="9" />
            <rect x="258" y="182" width="40" height="40" rx="9" />
            <rect x="236" y="146" width="40" height="40" rx="9" />
          </g>
          <g stroke="#e9b949" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M410 232v-46M410 196c-10 0-13-8-13-14M410 196c10 0 13-8 13-14M410 212c-10 0-13-8-13-14M410 212c10 0 13-8 13-14" />
            <path d="M452 240v-54M452 198c-10 0-13-8-13-14M452 198c10 0 13-8 13-14M452 216c-10 0-13-8-13-14M452 216c10 0 13-8 13-14" />
            <path d="M494 232v-44M494 198c-10 0-13-8-13-14M494 198c10 0 13-8 13-14M494 214c-10 0-13-8-13-14M494 214c10 0 13-8 13-14" />
          </g>
          <g>
            <rect x="540" y="196" width="70" height="30" rx="5" fill="#f4efe4" />
            <rect x="588" y="182" width="34" height="44" rx="6" fill="#b8482f" />
            <circle cx="560" cy="230" r="10" fill="#17382b" />
            <circle cx="606" cy="230" r="10" fill="#17382b" />
          </g>
        </svg>
      </section>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <div>
            <h1 className="h1">Entrar</h1>
            <div className="small muted">Usa el usuario que te dio la administración.</div>
          </div>
          <Field label="Usuario">
            <Input
              icon="user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ej. cajero"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </Field>
          <Field
            label="Contraseña"
            link={
              <button type="button" className="link" onClick={() => setShow(!show)}>
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
          <Button variant="primary" size="lg" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
