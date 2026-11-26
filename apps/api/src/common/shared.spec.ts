import * as shared from '@forrajera/shared';
import * as local from './password';
import { IncidentType, Role, PaymentMethod, RefundMethod, RouteStatus, SalePayment, SaleStatus, StopStatus } from '@prisma/client';

/** Si alguien cambia un enum en schema.prisma, esta prueba avisa que las apps quedaron desalineadas. */
describe('@forrajera/shared coincide con la base de datos', () => {
  const same = (list: readonly string[], prismaEnum: Record<string, string>) => expect([...list].sort()).toEqual(Object.values(prismaEnum).sort());

  it('estados de ruta y parada', () => {
    same(shared.ROUTE_STATUSES, RouteStatus);
    same(shared.STOP_STATUSES, StopStatus);
  });
  it('formas de pago, estados de venta y reembolsos', () => {
    same(shared.PAYMENT_METHODS, PaymentMethod);
    same(shared.SALE_PAYMENTS, SalePayment);
    same(shared.SALE_STATUSES, SaleStatus);
    same(shared.REFUND_METHODS, RefundMethod);
  });
  it('tipos de incidencia', () => same(shared.INCIDENT_TYPES, IncidentType));
  it('roles', () => {
    same(shared.ROLES, Role);
    for (const r of shared.ROLES) expect(shared.ROLE_LABEL[r]).toBeTruthy();
  });
  it('la copia de las reglas de contraseña en la API da lo mismo que la compartida', () => {
    expect(local.PASSWORD_MIN_LENGTH).toBe(shared.PASSWORD_MIN_LENGTH);
    expect(local.PASSWORD_MAX_LENGTH).toBe(shared.PASSWORD_MAX_LENGTH);
    expect(local.PASSWORD_CHANGE_REQUIRED).toBe(shared.PASSWORD_CHANGE_REQUIRED);
    const cases: [string, string?][] = [
      ['corta'],
      ['x'.repeat(129)],
      ['mi-luis-secreta', 'luis'],
      ['aaaaaaaaaaaa'],
      ['Cambiar123'],
      ['contraseña'],
      ['una-clave-buena-1', 'luis'],
      ['una-clave-buena-1'],
    ];
    for (const [pw, user] of cases) expect(local.passwordProblem(pw, user)).toBe(shared.passwordProblem(pw, user));
  });
  it('cada valor tiene etiqueta', () => {
    for (const r of shared.FAIL_REASONS) expect(shared.FAIL_LABEL[r]).toBeTruthy();
    for (const p of shared.SALE_PAYMENTS) expect(shared.PAY_LABEL[p]).toBeTruthy();
  });
});
