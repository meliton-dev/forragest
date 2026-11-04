import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePref, writePref } from '../lib/prefs';
import { Icon } from './kit';

/** Consejo breve que se muestra una sola vez en el momento en que sirve; se pliega al cerrarlo y no vuelve. */
export function Hint({ id, children }: { id: string; children: ReactNode }) {
  const seen = usePref(`hint.${id}`);
  return (
    <AnimatePresence initial={false}>
      {!seen && (
        <motion.div
          className="hint"
          role="note"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, height: 0, marginBottom: -14, paddingTop: 0, paddingBottom: 0, transition: { duration: 0.22 } }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <Icon name="info" size={16} />
          <div className="t">{children}</div>
          <button onClick={() => writePref(`hint.${id}`, '1')}>Entendido</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
