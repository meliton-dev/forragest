import { databaseHost, isLocalDatabaseUrl } from '../../prisma/db-guard';

describe('db-guard', () => {
  it('reconoce las bases locales', () => {
    for (const url of [
      'postgresql://forrajera:forrajera@localhost:5432/forrajera',
      'postgresql://u:p@127.0.0.1:5432/x',
      'postgresql://u:p@[::1]:5432/x',
      'postgresql://u:p@LOCALHOST/x',
    ]) {
      expect(isLocalDatabaseUrl(url)).toBe(true);
    }
  });

  it('trata como remota cualquier otra base, o una URL ausente o ilegible', () => {
    for (const url of [
      'postgresql://u:p@ejemplo.com/x',
      'postgresql://u:p@dpg-abc123-a.oregon-postgres.render.com/x',
      'postgresql://u:p@localhost.ejemplo.com/x',
      '',
      undefined,
      'no es una url',
    ]) {
      expect(isLocalDatabaseUrl(url)).toBe(false);
    }
  });

  it('databaseHost devuelve solo el host, nunca la contraseña', () => {
    expect(databaseHost('postgresql://usuario:secreta@ejemplo.com:5432/x')).toBe('ejemplo.com');
    expect(databaseHost('postgresql://u:p@[::1]:5432/x')).toBe('::1');
    expect(databaseHost(undefined)).toBeNull();
  });
});
