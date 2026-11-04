import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { dismissToast, useToast } from '../lib/toast';
import { Icon } from './kit';

const spring = { type: 'spring', stiffness: 420, damping: 32 } as const;

/** Mensaje breve con “Deshacer”; entra y sale con un resorte y la barra muestra cuánto tiempo queda. */
export function Toaster() {
  const t = useToast();
  return (
    <AnimatePresence>
      {t && (
        <motion.div
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
            <motion.button
              className="act"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                const undo = t.undo!;
                dismissToast();
                undo();
              }}
            >
              Deshacer
            </motion.button>
          )}
          <span className="bar" aria-hidden>
            <i style={{ animationDuration: `${t.ms}ms` }} />
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Explica para qué se usa la ubicación antes de mostrar el permiso del sistema (que solo aparece una vez). */
export function GpsPrimer({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), []);
  return (
    <motion.div
      className="sheet-wrap"
      role="dialog"
      aria-modal="true"
      aria-label="Compartir ubicación"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.div className="sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.22 } }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
        <motion.div className="ico" initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.12 }}>
          <Icon name="pin" size={26} />
        </motion.div>
        <div>
          <h2 className="h2" style={{ fontSize: 22, lineHeight: '28px' }}>¿Compartir tu ubicación?</h2>
          <p className="small muted2" style={{ margin: '6px 0 0', fontSize: 15, lineHeight: '22px' }}>
            Tu supervisor verá dónde va el camión para avisar a los clientes y ayudarte si hay un problema.
            Se comparte <b>solo mientras la ruta está en curso</b> y con la app abierta; se detiene al cerrar la ruta.
          </p>
        </div>
        <motion.button ref={ok} className="btn primary" whileTap={{ scale: 0.96 }} onClick={onAccept}>
          Activar ubicación
        </motion.button>
        <motion.button className="btn ghost" whileTap={{ scale: 0.96 }} onClick={onDecline}>
          Ahora no
        </motion.button>
        <p className="caption muted" style={{ margin: 0, textAlign: 'center' }}>Puedes cambiarlo después en Perfil.</p>
      </motion.div>
    </motion.div>
  );
}
