import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  for (const [code, name] of [['OVINO', 'Ovino'], ['BOVINO', 'Bovino'], ['AVES', 'Aves']]) {
    await prisma.productLine.upsert({ where: { code }, update: {}, create: { code, name } });
  }
  const users: [string, string, Role][] = [
    ['admin', 'Administrador', Role.ADMINISTRADOR],
    ['cajero', 'Cajero Demo', Role.CAJERO],
    ['almacen', 'Almacenista Demo', Role.ALMACENISTA],
    ['chofer', 'Chofer Demo', Role.CHOFER],
    ['compras', 'Gerente de Compras Demo', Role.GERENTE_COMPRAS],
    ['supervisor', 'Supervisor de Rutas Demo', Role.SUPERVISOR_RUTAS],
  ];
  const passwordHash = await bcrypt.hash('cambiar123', 10);
  for (const [username, fullName, role] of users) {
    await prisma.user.upsert({ where: { username }, update: {}, create: { username, fullName, role, passwordHash } });
  }
}

main().finally(() => prisma.$disconnect());
