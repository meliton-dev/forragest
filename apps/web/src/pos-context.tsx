import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearSession, getUser, type SessionUser } from './lib/api';
import { emptyCart, type Cart } from './lib/cart';
import type { CatalogItem, ShiftSummary } from './lib/types';

interface Pos {
  user: SessionUser;
  /** undefined = cargando, null = sin turno abierto */
  shift: ShiftSummary | null | undefined;
  reloadShift: () => Promise<void>;
  cart: Cart;
  setCart: (fn: (c: Cart) => Cart) => void;
  add: (item: CatalogItem) => void;
  setQty: (key: string, qty: number) => void;
  clearCart: () => void;
  catalogVersion: number;
  bumpCatalog: () => void;
  logout: () => void;
}

const Ctx = createContext<Pos | null>(null);
export const usePos = () => useContext(Ctx)!;

export function PosProvider({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const user = getUser()!;
  const [shift, setShift] = useState<ShiftSummary | null | undefined>(undefined);
  const [cart, setCartState] = useState<Cart>(emptyCart());
  const [catalogVersion, setCatalogVersion] = useState(0);

  const reloadShift = useCallback(async () => {
    setShift(await api<ShiftSummary | null>('GET', '/pos/shift'));
  }, []);
  useEffect(() => {
    void reloadShift().catch(() => setShift(null));
  }, [reloadShift]);

  const setCart = useCallback((fn: (c: Cart) => Cart) => setCartState((c) => fn(c)), []);
  const add = useCallback(
    (item: CatalogItem) =>
      setCartState((c) => {
        const i = c.lines.findIndex((l) => l.item.key === item.key);
        if (i >= 0) {
          if (c.lines[i].qty >= item.stockUnits) return c;
          return { ...c, lines: c.lines.map((l, k) => (k === i ? { ...l, qty: l.qty + 1 } : l)) };
        }
        return { ...c, lines: [...c.lines, { item, qty: 1 }] };
      }),
    [],
  );
  const setQty = useCallback(
    (key: string, qty: number) =>
      setCartState((c) => ({
        ...c,
        lines:
          qty <= 0 ? c.lines.filter((l) => l.item.key !== key) : c.lines.map((l) => (l.item.key === key ? { ...l, qty: Math.min(qty, l.item.stockUnits) } : l)),
      })),
    [],
  );

  const value: Pos = {
    user,
    shift,
    reloadShift,
    cart,
    setCart,
    add,
    setQty,
    clearCart: () => setCartState(emptyCart()),
    catalogVersion,
    bumpCatalog: () => setCatalogVersion((v) => v + 1),
    logout: () => {
      clearSession();
      onLogout();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
