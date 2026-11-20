import { DriverService } from './driver.service';

describe('DriverService.close', () => {
  const route = (status: string) => ({
    id: 7,
    name: 'Ruta Norte',
    driverId: 3,
    status,
    stops: [
      {
        status: 'ENTREGADA',
        items: [{ productId: 1, quantity: 10, deliveredQty: 6, factor: 40, product: { purchasePrice: 300 } }],
      },
    ],
  });

  const make = (status: string, claimed: number) => {
    const tx = { route: { updateMany: jest.fn().mockResolvedValue({ count: claimed }) } };
    const prisma = {
      route: { findUnique: jest.fn().mockResolvedValue(route(status)) },
      $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    const inventory = { addEntry: jest.fn().mockResolvedValue(undefined) };
    const svc = new DriverService(prisma as never, inventory as never);
    jest.spyOn(svc, 'summary').mockResolvedValue({ status: 'FINALIZADA' } as never);
    return { svc, tx, inventory };
  };

  it('el primer cierre reclama la ruta y regresa el inventario una vez', async () => {
    const { svc, tx, inventory } = make('EN_CURSO', 1);
    await svc.close(7, 3);
    expect(tx.route.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, status: 'EN_CURSO' } }));
    expect(inventory.addEntry).toHaveBeenCalledTimes(1);
    expect(inventory.addEntry).toHaveBeenCalledWith(expect.objectContaining({ productId: 1, quantity: 160, type: 'ENTRADA_RUTA' }), tx);
  });

  it('un cierre simultáneo que pierde la carrera no regresa inventario y responde normal', async () => {
    const { svc, inventory } = make('EN_CURSO', 0);
    await expect(svc.close(7, 3)).resolves.toMatchObject({ status: 'FINALIZADA' });
    expect(inventory.addEntry).not.toHaveBeenCalled();
  });

  it('una ruta ya finalizada responde el resumen sin tocar nada', async () => {
    const { svc, tx, inventory } = make('FINALIZADA', 1);
    await expect(svc.close(7, 3)).resolves.toMatchObject({ status: 'FINALIZADA' });
    expect(tx.route.updateMany).not.toHaveBeenCalled();
    expect(inventory.addEntry).not.toHaveBeenCalled();
  });
});
