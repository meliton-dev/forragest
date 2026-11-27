import { AnimatePresence, m } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { dismissToast, useToast } from '../lib/toast';
import { Icon } from './kit';

const spring = { type: 'spring', stiffness: 420, damping: 32 } as const;

/** Mensaje breve con “Deshacer”; entra y sale con un resorte y la barra muestra cuánto tiempo queda. */
export function Toaster() {
  const t = useToast();
  return (
    <AnimatePresence>
      {t && (
        <m.div
          key={t.id}
          className="toast"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96, transition: { duration: 0.16 } }}
          transition={spring}
        >
          <Icon name={t.tone === 'warn' ? 'alert' : 'check'} size={18} color={t.tone === 'warn' ? '#ffd27a' : '#9be3b2'} sw={2.5} />
          <span className="msg">{t.message}</span>
          {t.undo && (
            <m.button
              className="act"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                const undo = t.undo!;
                dismissToast();
                undo();
              }}
            >
              Deshacer
            </m.button>
          )}
          <span className="bar" aria-hidden>
            <i style={{ animationDuration: `${t.ms}ms` }} />
          </span>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Aviso (una sola vez por chofer) de que la ubicación se comparte durante la ruta. Va antes del permiso del sistema,
 * que solo aparece una vez: así el chofer sabe por qué se le pide.
 */
export function GpsNotice({ onClose }: { onClose: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), []);
  return (
    <m.div
      className="sheet-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="Compartir ubicación"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <m.div
        className="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.22 } }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <m.div
          className="ico"
          initial={{ scale: 0.4, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.12 }}
        >
          <Icon name="pin" size={26} />
        </m.div>
        <div>
          <h2 className="h2" style={{ fontSize: 22, lineHeight: '28px' }}>
            Tu ubicación se comparte durante la ruta
          </h2>
          <p className="small muted2" style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '22px' }}>
            Tu supervisor ve dónde va el camión para avisar a los clientes y ayudarte si hay un problema. Se comparte <b>solo mientras la ruta está en curso</b>{' '}
            y se detiene al cerrar la ruta.
          </p>
        </div>
        <m.button ref={ok} className="btn primary" whileTap={{ scale: 0.96 }} onClick={onClose}>
          Entendido
        </m.button>
        <p className="caption muted" style={{ margin: 0, textAlign: 'center' }}>
          Si el teléfono te pide permiso de ubicación, elige “Permitir”.
        </p>
      </m.div>
    </m.div>
  );
}

/** Pregunta antes de cerrar la sesión, para que un toque por error no saque al chofer en plena ruta. */
export function ConfirmLogout({ sharing, onConfirm, onCancel }: { sharing?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  // salir puede tardar unos segundos (primero intenta mandar lo registrado)
  const [busy, setBusy] = useState(false);
  useEffect(() => cancel.current?.focus(), []);
  return (
    <m.div
      className="sheet-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="Cerrar sesión"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <m.div
        className="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.22 } }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div>
          <h2 className="h2" style={{ fontSize: 22, lineHeight: '28px' }}>
            ¿Cerrar sesión?
          </h2>
          <p className="small muted2" style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '22px' }}>
            {sharing && 'Tu ruta está en curso: tu ubicación dejará de compartirse. '}
            Lo que registraste no se pierde. Para volver a entrar necesitarás tu usuario y contraseña.
          </p>
        </div>
        <m.button
          className="btn primary"
          whileTap={{ scale: 0.96 }}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm();
          }}
        >
          {busy ? 'Cerrando…' : 'Sí, cerrar sesión'}
        </m.button>
        <m.button ref={cancel} className="btn secondary" whileTap={{ scale: 0.96 }} disabled={busy} onClick={onCancel}>
          Cancelar
        </m.button>
      </m.div>
    </m.div>
  );
}
