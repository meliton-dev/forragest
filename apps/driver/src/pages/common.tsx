import type { ReactNode } from 'react';
import { refresh, useStore } from '../lib/store';
import type { Route } from '../lib/types';
import { Button, Empty, Header, Icon, TabBar } from '../ui/kit';

/** Muestra la pantalla solo cuando hay una ruta cargada; si no, explica por qué. */
export function RouteGate({ title, tabs, children }: { title: string; tabs?: boolean; children: (route: Route) => ReactNode }) {
  const s = useStore();
  if (s.route) return <>{children(s.route)}</>;
  return (
    <div className="screen">
      <Header title={title} />
      <div className="content">
        {s.loading || !s.ready ? (
          <Empty icon="sync" title="Cargando tu ruta…" />
        ) : s.noRoute ? (
          <Empty icon="route" title="Sin ruta asignada hoy">
            Cuando tu supervisor te asigne una ruta aparecerá aquí.
          </Empty>
        ) : (
          <Empty icon="wifioff" title="No hay datos guardados">
            Conéctate a internet una vez para descargar tu ruta.
          </Empty>
        )}
        {!s.loading && (
          <Button variant="secondary" icon="sync" onClick={() => void refresh()}>
            Reintentar
          </Button>
        )}
      </div>
      {tabs && <TabBar />}
    </div>
  );
}

export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export function Spinner() {
  return <Icon name="sync" size={16} />;
}
