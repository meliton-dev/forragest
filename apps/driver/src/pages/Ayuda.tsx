import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Header, Icon, Input } from '../ui/kit';
import { Onboarding } from '../ui/Onboarding';

interface Qa {
  q: string;
  a: string;
}
interface Topic {
  title: string;
  icon: string;
  items: Qa[];
}

/** Dudas reales de un repartidor, agrupadas por el momento de la ruta en que aparecen. */
export const TOPICS: Topic[] = [
  {
    title: 'Empezar',
    icon: 'user',
    items: [
      { q: 'Olvidé mi contraseña', a: 'Pide a tu supervisor o al administrador que te la restablezca. Por seguridad la app no puede recuperarla sola.' },
      {
        q: '¿Cómo instalo Forragest en mi teléfono?',
        a: 'En Android: Perfil › “Instalar la aplicación”. En iPhone: en Safari toca Compartir y elige “Agregar a pantalla de inicio”. La instalación solo está disponible cuando la app se abre con conexión segura (https).',
      },
      {
        q: 'No me aparece ninguna ruta',
        a: 'Todavía no te asignaron una ruta para hoy. Avisa a tu supervisor. Si ya te la asignó, cierra la app, ábrela de nuevo y espera unos segundos.',
      },
    ],
  },
  {
    title: 'Cargar el camión',
    icon: 'truck',
    items: [
      {
        q: '¿Cómo cargo el camión y salgo a ruta?',
        a: 'En Ruta toca “Carga tu camión”, marca cada producto cuando lo subas y confirma. Necesitas conexión solo en este paso, porque el sistema descuenta el inventario del almacén.',
      },
      {
        q: 'Me dieron menos producto del que dice la lista',
        a: 'No marques lo que no subiste. Avisa al almacén o a tu supervisor antes de salir y, si ya saliste, repórtalo en Incidencias para que quede registrado.',
      },
      {
        q: '¿Tengo que seguir el orden de las paradas?',
        a: 'Se recomienda, porque está pensado para ahorrar camino y las horas estimadas dependen de él. Pero puedes abrir y atender cualquier parada si el cliente lo necesita.',
      },
    ],
  },
  {
    title: 'En la parada',
    icon: 'pin',
    items: [
      {
        q: 'No encuentro la dirección o el cliente no contesta',
        a: 'En la parada toca “Navegar” para abrir el mapa y “Llamar” para marcar al cliente. Si no hay forma de entregar, usa “No se pudo entregar” y elige el motivo.',
      },
      {
        q: 'El cliente no está o no quiso recibir',
        a: 'Toca “No se pudo entregar”, elige el motivo (cliente ausente, rechazó…) y confirma. El producto sigue en tu camión y al cerrar la ruta regresa al almacén.',
      },
      {
        q: 'El cliente quiere recibir menos de lo pedido',
        a: 'Todavía no se puede registrar una entrega parcial en la app. Registra la entrega y describe la diferencia en Incidencias, o toca “No se pudo entregar” si no recibe nada. Avisa a tu supervisor.',
      },
      {
        q: 'El cliente no quiere firmar',
        a: 'Toma una fotografía del comprobante o del cliente con el producto, como respaldo de la entrega. La firma o la foto sirven de evidencia para cualquier aclaración.',
      },
      {
        q: 'Me equivoqué en una entrega o un cobro',
        a: 'Justo después de registrarlo aparece “Deshacer” durante 8 segundos. Si ya pasó ese tiempo, el registro ya se envió: avisa a tu supervisor para que lo corrija.',
      },
    ],
  },
  {
    title: 'Cobros',
    icon: 'wallet',
    items: [
      {
        q: '¿Qué significa “Contado” y “Crédito”?',
        a: 'Contado: cobras al entregar. Crédito: no cobras ahora, el cliente paga después y el saldo queda en su cuenta. En ambos casos pide la firma.',
      },
      {
        q: 'El cliente paga menos de lo que debe',
        a: 'Escribe lo que realmente te dio. La pantalla te muestra el saldo que queda pendiente y ese saldo no se pierde: queda a cargo del cliente.',
      },
      { q: 'Me pagaron en otro momento, no al entregar', a: 'En Cobros toca “Registrar cobro”, elige al cliente, el monto y si fue efectivo o transferencia.' },
      {
        q: '¿Por qué debo entregar efectivo al regresar?',
        a: 'Porque todo lo cobrado en efectivo es del negocio. En el cierre de ruta ves el monto exacto que debes entregar; si no cuadra con lo que tienes, repórtalo en Incidencias antes de cerrar.',
      },
    ],
  },
  {
    title: 'Si algo se cierra',
    icon: 'info',
    items: [
      {
        q: 'Cerré la app o se acabó la batería',
        a: 'Lo que registraste sigue guardado en el teléfono. Vuelve a abrir la app y continúa donde te quedaste.',
      },
      {
        q: 'La app me pidió entrar otra vez',
        a: 'Entra con tu usuario y contraseña. Lo que ya habías registrado no se pierde.',
      },
    ],
  },
  {
    title: 'Ubicación y privacidad',
    icon: 'lock',
    items: [
      {
        q: '¿Quién ve mi ubicación y cuándo?',
        a: 'Solo tu supervisor de rutas, siempre que la ruta está en curso. Empieza sola al salir del almacén y se detiene al cerrar la ruta.',
      },
      {
        q: 'Negué el permiso de ubicación, ¿cómo lo activo?',
        a: 'En el navegador abre los permisos del sitio (el candado junto a la dirección), permite “Ubicación” y vuelve a la app. Sin ella tu supervisor no puede seguir la ruta.',
      },
    ],
  },
  {
    title: 'Terminar la ruta',
    icon: 'check',
    items: [
      {
        q: '¿Cómo cierro la ruta?',
        a: 'Cuando atiendas todas las paradas aparece “Ruta completa”. Revisa el resumen y el efectivo que debes entregar, y toca “Registrar regreso al almacén”.',
      },
      {
        q: 'Me sobró producto',
        a: 'Es normal si hubo no entregas. En el cierre ves exactamente qué regresa al almacén; al registrar el regreso vuelve a inventario.',
      },
    ],
  },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Ayuda() {
  const [tour, setTour] = useState(false);
  const [query, setQuery] = useState('');
  const topics = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return TOPICS;
    return TOPICS.map((t) => ({ ...t, items: t.items.filter((i) => norm(i.q + ' ' + i.a).includes(q)) })).filter((t) => t.items.length);
  }, [query]);

  return (
    <div className="screen">
      <Header title="Ayuda" sub="Dudas frecuentes y tutorial" back="/perfil" />
      <div className="content">
        <button className="card row-card" style={{ textAlign: 'left' }} onClick={() => setTour(true)}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Icon name="route" size={22} color="var(--ink)" />
          </div>
          <div className="grow">
            <div className="title">Ver el tutorial otra vez</div>
            <div className="caption muted">3 pasos, menos de un minuto</div>
          </div>
          <Icon name="right" size={16} color="var(--text-3)" />
        </button>

        <Input
          icon="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar: firma, cobro, ubicación…"
          aria-label="Buscar en la ayuda"
        />

        {topics.map((t) => (
          <section key={t.title} className="col gap8">
            <span className="overline row" style={{ gap: 6 }}>
              <Icon name={t.icon} size={14} />
              {t.title}
            </span>
            {t.items.map((i) => (
              <Faq key={i.q} q={i.q} a={i.a} open={!!query.trim()} />
            ))}
          </section>
        ))}

        {topics.length === 0 && (
          <div className="card flat">
            <div className="title">No encontramos “{query}”</div>
            <div className="small muted2">Prueba con otra palabra o habla con tu supervisor de rutas.</div>
          </div>
        )}

        <div className="card flat">
          <div className="small">
            ¿Sigue la duda? Habla con tu supervisor de rutas: él ve tus entregas y tu ubicación en tiempo real y puede corregir un registro.
          </div>
        </div>
      </div>
      <AnimatePresence>{tour && <Onboarding key="tour" onClose={() => setTour(false)} />}</AnimatePresence>
    </div>
  );
}

function Faq({ q, a, open: forced }: { q: string; a: string; open?: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = open || !!forced;
  return (
    <div className="faq">
      <button aria-expanded={isOpen} onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }} style={{ display: 'grid' }}>
          <Icon name="down" size={20} color="var(--text-3)" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="ans">{a}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
