import { useState } from 'react';
import { ROLE_LABEL } from '@forrajera/shared';
import type { SessionUser } from '../lib/api';
import { Button, Empty } from '../ui/kit';
import { ChangePasswordModal } from './Password';

/** Perfiles que todavía no tienen pantallas en esta aplicación (por ahora, el almacenista). */
export function SinPantallas({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className="login">
      <div className="login-form" style={{ gridColumn: '1 / -1' }}>
        <div className="login-card col gap16" style={{ textAlign: 'center' }}>
          <Empty icon="box" title="Tu perfil todavía no tiene pantallas en esta aplicación">
            Hola, {user.fullName} ({ROLE_LABEL[user.role] ?? user.role}). Cuando haya algo para ti, aparecerá aquí.
          </Empty>
          <div className="row gap8" style={{ justifyContent: 'center' }}>
            <Button icon="lock" onClick={() => setChanging(true)}>
              Cambiar contraseña
            </Button>
            <Button icon="logout" onClick={onLogout}>
              Salir
            </Button>
          </div>
        </div>
      </div>
      {changing && <ChangePasswordModal username={user.username} onClose={() => setChanging(false)} />}
    </div>
  );
}
