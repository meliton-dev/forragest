import { assertProductionConfig, parseCorsOrigins } from './config';

const ok = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(40),
  DATABASE_URL: 'postgresql://u:p@h:5432/d',
  CORS_ORIGINS: 'https://forragest-repartos.onrender.com, https://forragest-web.onrender.com/',
} as NodeJS.ProcessEnv;

describe('configuración de producción', () => {
  it('acepta una configuración completa', () => {
    expect(() => assertProductionConfig(ok)).not.toThrow();
  });
  it('no exige nada fuera de producción', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
  });
  it('rechaza CORS_ORIGINS ausente o vacío', () => {
    expect(() => assertProductionConfig({ ...ok, CORS_ORIGINS: undefined })).toThrow(/CORS_ORIGINS/);
    expect(() => assertProductionConfig({ ...ok, CORS_ORIGINS: ' , ' })).toThrow(/CORS_ORIGINS/);
  });
  it('rechaza comodines y direcciones sin protocolo', () => {
    expect(() => assertProductionConfig({ ...ok, CORS_ORIGINS: '*' })).toThrow(/inválido/);
    expect(() => assertProductionConfig({ ...ok, CORS_ORIGINS: 'forragest.onrender.com' })).toThrow(/inválido/);
    expect(() => assertProductionConfig({ ...ok, CORS_ORIGINS: 'https://a.com/ruta' })).toThrow(/inválido/);
  });
  it('sigue exigiendo secreto fuerte y base de datos', () => {
    expect(() => assertProductionConfig({ ...ok, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
    expect(() => assertProductionConfig({ ...ok, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
  it('normaliza la lista de orígenes (espacios y diagonal final)', () => {
    expect(parseCorsOrigins(' https://a.com/ ,https://b.com ')).toEqual(['https://a.com', 'https://b.com']);
  });
});
