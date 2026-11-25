import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './kit';

const G = 'var(--ink)';
const GS = 'var(--accent-soft)';
const B = 'var(--border-strong)';
const S = 'var(--surface)';

/** Ilustraciones sencillas con los colores de la marca. */
function ArtRoute() {
  return (
    <svg viewBox="0 0 320 240" fill="none" role="img" aria-label="Lista de paradas con la siguiente destacada">
      <rect x="20" y="16" width="280" height="208" rx="20" fill={S} stroke={B} />
      <line x1="60" y1="58" x2="60" y2="182" stroke={B} strokeWidth="3" />
      <line x1="60" y1="58" x2="60" y2="104" stroke={G} strokeWidth="3" />
      <circle cx="60" cy="58" r="14" fill={G} />
      <path d="m53 58 5 5 9-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="88" y="42" width="190" height="32" rx="8" fill={GS} />
      <rect x="98" y="52" width="100" height="6" rx="3" fill={G} opacity=".55" />
      <rect x="98" y="62" width="64" height="5" rx="2.5" fill={G} opacity=".3" />
      <circle cx="60" cy="118" r="14" fill={S} stroke={G} strokeWidth="3" />
      <circle cx="60" cy="118" r="5" fill={G} />
      <rect x="88" y="92" width="190" height="62" rx="10" fill={S} stroke={G} strokeWidth="2" />
      <rect x="100" y="104" width="86" height="7" rx="3.5" fill="var(--text)" opacity=".8" />
      <rect x="100" y="117" width="120" height="5" rx="2.5" fill={B} />
      <rect x="100" y="132" width="76" height="14" rx="7" fill={G} />
      <rect x="184" y="132" width="86" height="14" rx="7" fill={GS} />
      <circle cx="60" cy="182" r="14" fill={S} stroke={B} strokeWidth="2" />
      <rect x="88" y="168" width="190" height="28" rx="8" fill="var(--bg)" />
      <rect x="98" y="178" width="90" height="6" rx="3" fill={B} />
    </svg>
  );
}

function ArtFlow() {
  const Step = ({ x, children, label }: { x: number; children: ReactNode; label: string }) => (
    <g>
      <rect x={x} y="70" width="78" height="78" rx="18" fill={S} stroke={B} />
      <g transform={`translate(${x + 39} 109)`}>{children}</g>
      <text x={x + 39} y="172" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-2)" fontFamily="Nunito Sans, sans-serif">
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 320 240" fill="none" role="img" aria-label="Pasos: llegar, firmar y cobrar">
      <Step x={14} label="Llegas">
        <path d="M-14 10 -14 -10 6 -10 6 10 -14 10M6 -4 14 -4 20 4 20 10 6 10" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="-7" cy="12" r="3.5" stroke={G} strokeWidth="2.5" fill={S} />
        <circle cx="12" cy="12" r="3.5" stroke={G} strokeWidth="2.5" fill={S} />
      </Step>
      <Step x={121} label="Firman">
        <path d="M-20 8c6-16 10 8 16-6s8 12 14 0 6 4 14-4" stroke={G} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="-22" y1="16" x2="22" y2="16" stroke={B} strokeWidth="2" />
      </Step>
      <Step x={228} label="Cobras">
        <rect x="-20" y="-12" width="40" height="24" rx="5" stroke={G} strokeWidth="2.5" />
        <circle cx="0" cy="0" r="6" stroke={G} strokeWidth="2.5" />
      </Step>
      <path d="M96 109h20m-6-6 6 6-6 6M203 109h20m-6-6 6 6-6 6" stroke={B} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="94" y="196" width="132" height="26" rx="13" fill={GS} />
      <text x="160" y="213" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)" fontFamily="Nunito Sans, sans-serif">
        Todo en una sola pantalla
      </text>
    </svg>
  );
}

function ArtPin() {
  return (
    <svg viewBox="0 0 320 240" fill="none" role="img" aria-label="Ubicación compartida durante la ruta">
      <circle cx="160" cy="130" r="86" fill={GS} opacity=".55" />
      <circle cx="160" cy="130" r="58" fill={GS} />
      <path d="M160 40c-26 0-46 19-46 44 0 33 46 76 46 76s46-43 46-76c0-25-20-44-46-44Z" fill={G} />
      <circle cx="160" cy="84" r="17" fill="#fff" />
      <path d="M150 85h-4v-9h20l8 9v5h-3" stroke={G} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="152" cy="92" r="3" stroke={G} strokeWidth="2" />
      <circle cx="169" cy="92" r="3" stroke={G} strokeWidth="2" />
      <rect x="82" y="190" width="156" height="30" rx="15" fill={S} stroke={B} />
      <circle cx="102" cy="205" r="5" fill="var(--ok)" />
      <text x="116" y="209" fontSize="12" fontWeight="600" fill="var(--text-2)" fontFamily="Nunito Sans, sans-serif">
        Solo con la ruta en curso
      </text>
    </svg>
  );
}

export const STEPS: { title: string; text: string; art: ReactNode }[] = [
  {
    title: 'Tu ruta del día',
    text: 'Verás tus paradas en orden. La siguiente aparece destacada con la dirección, lo que llevas y cuánto cobrar. Toca “Navegar” para abrir el mapa.',
    art: <ArtRoute />,
  },
  {
    title: 'Cargar, llegar, entregar',
    text: 'Primero confirma la carga del camión. Al llegar a cada parada toca “Entregar”: pide la firma (o toma una foto) y registra el cobro, todo en la misma pantalla. Si te equivocas, tienes unos segundos para tocar “Deshacer”.',
    art: <ArtFlow />,
  },
  {
    title: 'Tu ubicación, solo en ruta',
    text: 'Al salir del almacén tu ubicación se comparte con tu supervisor para que sepa dónde va el camión. Se detiene al cerrar la ruta.',
    art: <ArtPin />,
  },
];

/** Tutorial de bienvenida: 3 pasos cortos, se puede omitir y volver a ver desde Ayuda. */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setI(n);
  };
  const last = i === STEPS.length - 1;
  const next = useRef<HTMLButtonElement>(null);
  const step = STEPS[i];

  useEffect(() => {
    next.current?.focus();
  }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="onb"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial de bienvenida"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="onb-top">
        <span className="caption muted2" aria-live="polite">
          Paso {i + 1} de {STEPS.length}
        </span>
        <button className="link" onClick={onClose}>
          Omitir
        </button>
      </div>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={i}
          custom={dir}
          className="onb-step"
          variants={{ enter: (d: number) => ({ opacity: 0, x: d * 48 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: d * -48 }) }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        >
          <div className="onb-art">
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '100%', display: 'grid', placeItems: 'center' }}
            >
              {step.art}
            </motion.div>
          </div>
          <div className="onb-body">
            <h2>{step.title}</h2>
            <p>{step.text}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="onb-foot">
        <div className="dots" aria-hidden>
          {STEPS.map((_, k) => (
            <motion.i
              key={k}
              animate={{ width: k === i ? 28 : 8, backgroundColor: k === i ? '#b8482f' : '#d2c5a6' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          ))}
        </div>
        <div className="btn-row">
          {i > 0 && (
            <motion.button className="btn secondary" style={{ flex: '0 0 110px' }} whileTap={{ scale: 0.96 }} onClick={() => go(i - 1)}>
              Atrás
            </motion.button>
          )}
          <motion.button ref={next} className="btn primary" whileTap={{ scale: 0.96 }} onClick={() => (last ? onClose() : go(i + 1))}>
            {last ? 'Empezar' : 'Siguiente'}
            {!last && <Icon name="right" size={18} sw={2.5} />}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
