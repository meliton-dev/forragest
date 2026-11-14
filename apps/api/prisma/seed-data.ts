import { Role } from '@prisma/client';

/**
 * Datos de la forrajera de demostración ("Forrajera San Miguel", Tulancingo, Hgo.).
 * TODO ES FICTICIO: personas, negocios, RFC, teléfonos y direcciones son inventados para que el sistema
 * se vea como en un negocio real. Cualquier parecido con alguien real es coincidencia.
 *
 * Las pruebas automáticas dependen de algunos datos (ver CONTEXTO.md, "Datos de demostración"):
 * los nombres de usuario, BV-001/AV-001/OV-001 con sus precios, BV-002 agotado, los cinco clientes de la
 * ruta de hoy y los nombres de los dos primeros choferes. No cambiarlos sin revisar apps/api/test.
 */

// ---------- Personal ----------
// El administrador va primero: las pruebas asumen que el usuario 1 no es chofer.
export const STAFF: [username: string, fullName: string, role: Role][] = [
  ['admin', 'Rogelio Islas', Role.ADMINISTRADOR], // dueño
  ['cajero', 'Guadalupe Téllez', Role.CAJERO],
  ['almacen', 'Fidel Barrera', Role.ALMACENISTA],
  ['chofer', 'Luis Gómez', Role.CHOFER],
  ['chofer2', 'Marco Díaz', Role.CHOFER],
  ['compras', 'Patricia Olvera', Role.GERENTE_COMPRAS],
  ['supervisor', 'Héctor Lozada', Role.SUPERVISOR_RUTAS],
  ['cajero2', 'Brenda Licona', Role.CAJERO], // caja 2: lunes y sábados
  ['chofer3', 'Abel Canales', Role.CHOFER],
];

export const VEHICLES: [plate: string, name: string][] = [
  ['TUL-482', 'Camión 6 t (Isuzu ELF)'],
  ['TUL-317', 'Camión 3.5 t (Hino 300)'],
  ['TUL-905', 'Camioneta 1.5 t (Nissan estacas)'],
];

// ---------- Catálogo ----------
export interface ProductDef {
  code: string;
  name: string;
  line: 'BOVINO' | 'OVINO' | 'AVES';
  description?: string;
  /** [nombre, kg por presentación, precio]. La primera define el precio por kg del producto. */
  pres: [string, number, number][];
  /** Costo de compra por kg. */
  cost: number;
  /** Existencia normal en kg. Si es menor que `min`, el producto se muestra bajo a propósito. */
  stock: number;
  /** Existencia mínima (punto de reorden) en kg. */
  min: number;
}

const p = (
  code: string,
  name: string,
  line: ProductDef['line'],
  pres: [string, number, number][],
  cost: number,
  stock: number,
  min: number,
  description?: string,
): ProductDef => ({ code, name, line, pres, cost, stock, min, description });

export const PRODUCTS: ProductDef[] = [
  // --- Bovino ---
  p(
    'BV-001',
    'Alimento bovino lechero',
    'BOVINO',
    [
      ['Saco 40 kg', 40, 430],
      ['Granel · kg', 1, 11],
    ],
    8.4,
    3200,
    800,
    'Balanceado 18 % de proteína para vacas en producción.',
  ),
  p('BV-002', 'Sal mineralizada bovino', 'BOVINO', [['Saco 25 kg', 25, 310]], 9.6, 0, 250, 'Mezcla mineral con fósforo al 8 %.'),
  p('BV-003', 'Concentrado bovino engorda', 'BOVINO', [['Saco 40 kg', 40, 465]], 9.1, 2400, 600, 'Finalización en corral, 14 % de proteína.'),
  p('BV-004', 'Iniciador para becerras', 'BOVINO', [['Saco 40 kg', 40, 498]], 9.85, 640, 200, 'Del destete a los 4 meses, 18 % de proteína.'),
  p('BV-005', 'Alimento bovino mantenimiento', 'BOVINO', [['Saco 40 kg', 40, 395]], 7.75, 960, 320, 'Vacas secas y ganado de cría, 12 % de proteína.'),
  p('BV-006', 'Pasta de soya', 'BOVINO', [['Saco 40 kg', 40, 520]], 10.6, 2000, 480, '44 % de proteína.'),
  p('BV-007', 'Salvado de trigo', 'BOVINO', [['Saco 30 kg', 30, 215]], 5.45, 900, 300),
  p('BV-008', 'Melaza de caña', 'BOVINO', [['Porrón 30 kg', 30, 195]], 4.7, 150, 300),
  p('BV-009', 'Alfalfa achicalada', 'BOVINO', [['Paca 25 kg', 25, 185]], 5.6, 1500, 500, 'Paca de primera, corte del Valle de Tulancingo.'),
  p('BV-010', 'Rastrojo de maíz molido', 'BOVINO', [['Saco 20 kg', 20, 96]], 3.4, 700, 240),
  p('BV-011', 'Bloque mineral bovino', 'BOVINO', [['Bloque 10 kg', 10, 185]], 13.8, 180, 60),
  p(
    'BV-012',
    'Sorgo molido',
    'BOVINO',
    [
      ['Saco 40 kg', 40, 330],
      ['Granel · kg', 1, 8.6],
    ],
    6.55,
    1300,
    400,
  ),
  p(
    'BV-013',
    'Maíz rolado',
    'BOVINO',
    [
      ['Saco 40 kg', 40, 348],
      ['Granel · kg', 1, 9.1],
    ],
    6.9,
    1400,
    400,
  ),
  p('BV-014', 'Avena forrajera', 'BOVINO', [['Paca 22 kg', 22, 150]], 5.1, 528, 176),

  // --- Ovino y caprino ---
  p(
    'OV-001',
    'Alimento ovino engorda',
    'OVINO',
    [
      ['Saco 40 kg', 40, 430],
      ['Saco 20 kg', 20, 220],
    ],
    8.45,
    3000,
    720,
    'Engorda intensiva de corderos, 15 % de proteína.',
  ),
  p('OV-002', 'Suplemento mineral ovino', 'OVINO', [['Saco 20 kg', 20, 185]], 7.6, 1200, 300, 'Sin cobre añadido.'),
  p(
    'OV-003',
    'Iniciador para corderos',
    'OVINO',
    [
      ['Saco 40 kg', 40, 478],
      ['Saco 20 kg', 20, 246],
    ],
    9.5,
    880,
    240,
    'Creep feeding, 18 % de proteína.',
  ),
  p('OV-004', 'Alimento ovino lactancia', 'OVINO', [['Saco 40 kg', 40, 448]], 8.85, 1280, 400),
  p('OV-005', 'Alimento ovino mantenimiento', 'OVINO', [['Saco 40 kg', 40, 398]], 7.8, 1040, 320),
  p('OV-006', 'Bloque mineral ovino', 'OVINO', [['Bloque 10 kg', 10, 175]], 13.1, 60, 100),
  p(
    'OV-007',
    'Cebada en grano',
    'OVINO',
    [
      ['Saco 40 kg', 40, 318],
      ['Granel · kg', 1, 8.3],
    ],
    6.3,
    1000,
    320,
  ),
  p('OV-008', 'Alimento para cabra lechera', 'OVINO', [['Saco 40 kg', 40, 442]], 8.75, 520, 160),
  p('OV-009', 'Sustituto de leche para corderos', 'OVINO', [['Saco 10 kg', 10, 690]], 54, 70, 30),

  // --- Aves ---
  p(
    'AV-001',
    'Alimento para postura',
    'AVES',
    [
      ['Saco 40 kg', 40, 380],
      ['Granel · kg', 1, 9.5],
    ],
    7.45,
    3000,
    720,
    'Gallina en producción, 16 % de proteína y 3.8 % de calcio.',
  ),
  p('AV-002', 'Iniciador pollo engorda', 'AVES', [['Saco 20 kg', 20, 240]], 9.5, 900, 300, 'De 1 a 21 días, 21 % de proteína.'),
  p('AV-003', 'Alimento de traspatio', 'AVES', [['Saco 20 kg', 20, 205]], 8.05, 900, 300),
  p(
    'AV-004',
    'Maíz quebrado',
    'AVES',
    [
      ['Granel · kg', 1, 7.8],
      ['Saco 40 kg', 40, 300],
    ],
    5.9,
    4000,
    1000,
  ),
  p(
    'AV-005',
    'Crecimiento pollo engorda',
    'AVES',
    [
      ['Saco 40 kg', 40, 456],
      ['Saco 20 kg', 20, 234],
    ],
    9.05,
    1000,
    320,
    'De 22 a 35 días, 19 % de proteína.',
  ),
  p('AV-006', 'Finalizador pollo engorda', 'AVES', [['Saco 40 kg', 40, 446]], 8.85, 1040, 320),
  p('AV-007', 'Iniciador para pollita', 'AVES', [['Saco 20 kg', 20, 236]], 9.3, 380, 120),
  p('AV-008', 'Alimento para guajolote', 'AVES', [['Saco 20 kg', 20, 244]], 9.65, 340, 100),
  p('AV-009', 'Alimento para codorniz', 'AVES', [['Saco 20 kg', 20, 262]], 10.4, 60, 100),
  p(
    'AV-010',
    'Maíz entero',
    'AVES',
    [
      ['Saco 50 kg', 50, 365],
      ['Granel · kg', 1, 7.6],
    ],
    5.75,
    5000,
    1200,
  ),
  p(
    'AV-011',
    'Sorgo entero',
    'AVES',
    [
      ['Saco 40 kg', 40, 272],
      ['Granel · kg', 1, 7.1],
    ],
    5.35,
    1300,
    400,
  ),
  p(
    'AV-012',
    'Trigo entero',
    'AVES',
    [
      ['Granel · kg', 1, 8.4],
      ['Saco 40 kg', 40, 325],
    ],
    6.6,
    800,
    250,
  ),
  p(
    'AV-013',
    'Mezcla de granos para gallo',
    'AVES',
    [
      ['Saco 25 kg', 25, 335],
      ['Granel · kg', 1, 14],
    ],
    10.5,
    325,
    100,
  ),
  p('AV-014', 'Concha de ostión molida', 'AVES', [['Saco 25 kg', 25, 128]], 3.8, 350, 100, 'Fuente de calcio para gallina de postura.'),
];

// ---------- Clientes ----------
export interface CustomerDef {
  name: string;
  rfc: string | null;
  address: string;
  phone: string;
  contact: string;
  creditLimit: number;
  creditDays: number;
  lat: number;
  lng: number;
  /** Ruta de reparto que le toca. */
  zone: string;
}

export const ZONE_TODAY = 'Ruta 12 · Zona Norte';
export const ZONES = ['Ruta 04 · Acatlán', 'Ruta 07 · Cuautepec', 'Ruta 09 · Santiago Tulantepec', 'Ruta 15 · Oriente', 'Ruta 02 · Centro'] as const;

const c = (
  name: string,
  rfc: string | null,
  address: string,
  phone: string,
  contact: string,
  creditLimit: number,
  creditDays: number,
  lat: number,
  lng: number,
  zone: string,
): CustomerDef => ({ name, rfc, address, phone, contact, creditLimit, creditDays, lat, lng, zone });

/** Cliente con crédito vencido (alerta en el punto de venta). */
export const OVERDUE_CUSTOMER = 'Borregos La Loma';

export const CUSTOMERS: CustomerDef[] = [
  // Los cinco primeros son las paradas de la ruta de hoy (las pruebas los buscan por nombre).
  c(
    'Rancho San Miguel',
    'RSM100315HT2',
    'Camino a San Miguel s/n, Tulancingo, Hgo.',
    '775 100 1122',
    'Ernesto Ramírez',
    80000,
    15,
    20.095,
    -98.33,
    'Ruta 15 · Oriente',
  ),
  c(
    'Borregos La Loma',
    'BLL140709QW1',
    'Km 4 Carr. a Cuautepec, Tulancingo, Hgo.',
    '775 118 4420',
    'Raúl Mendoza',
    60000,
    15,
    20.078,
    -98.305,
    'Ruta 07 · Cuautepec',
  ),
  c(
    'Establo Los Pinos',
    'ELP120822KJ5',
    'Carr. Federal km 12, Tulancingo, Hgo.',
    '775 224 7788',
    'Raúl Pineda',
    150000,
    30,
    20.11,
    -98.405,
    'Ruta 04 · Acatlán',
  ),
  c('Granja Avícola Sol', 'GAS110601LK9', 'Av. del Sol 88, Acatlán, Hgo.', '771 300 5566', 'María Sol', 120000, 30, 20.1417, -98.4333, 'Ruta 04 · Acatlán'),
  c(
    'Rancho El Encino',
    'REE090927NB3',
    'Camino al Encino s/n, Santiago Tulantepec',
    '775 456 1290',
    'Jesús Mora',
    50000,
    15,
    20.05,
    -98.37,
    'Ruta 09 · Santiago Tulantepec',
  ),

  // Acatlán y poniente
  c(
    'Rancho La Providencia',
    'RPR081120M47',
    'Camino a Jaltepec km 3, Tulancingo, Hgo.',
    '775 555 0111',
    'Aurelio Soto',
    70000,
    15,
    20.112,
    -98.392,
    'Ruta 04 · Acatlán',
  ),
  c(
    'Establo Santa Rita',
    'ESR990614D85',
    'Carr. Tulancingo–Acatlán km 6, Acatlán, Hgo.',
    '775 555 0112',
    'Norma Vargas',
    120000,
    30,
    20.128,
    -98.415,
    'Ruta 04 · Acatlán',
  ),
  c(
    'Unión de Ovinocultores de Acatlán',
    'UOA030218P63',
    'Plaza Principal s/n, Acatlán, Hgo.',
    '775 555 0113',
    'Felipe Escamilla',
    140000,
    30,
    20.146,
    -98.439,
    'Ruta 04 · Acatlán',
  ),
  c(
    'Granja Las Palomas',
    'GPA150903R28',
    'Camino a Zupitlán s/n, Acatlán, Hgo.',
    '775 555 0114',
    'Rosa Elena Ortiz',
    35000,
    15,
    20.17,
    -98.42,
    'Ruta 04 · Acatlán',
  ),

  // Cuautepec
  c(
    'Granja El Porvenir',
    'GPO070426T91',
    'Calle Reforma 45, Cuautepec de Hinojosa, Hgo.',
    '775 555 0121',
    'Octavio Cruz',
    60000,
    15,
    20.036,
    -98.309,
    'Ruta 07 · Cuautepec',
  ),
  c(
    'Corrales Hueyapan',
    'CHU121015F54',
    'Loc. Hueyapan, Cuautepec de Hinojosa, Hgo.',
    '775 555 0122',
    'Ramiro Olvera',
    45000,
    15,
    20.012,
    -98.262,
    'Ruta 07 · Cuautepec',
  ),
  c(
    'Establo San Isidro',
    'ESI050515B37',
    'Carr. a Acaxochitlán km 5, Tulancingo, Hgo.',
    '775 555 0123',
    'Isidro Peláez',
    95000,
    30,
    20.102,
    -98.31,
    'Ruta 07 · Cuautepec',
  ),

  // Santiago Tulantepec y sur
  c(
    'Rancho La Cañada',
    'RCA110730H16',
    'Camino a La Cañada s/n, Santiago Tulantepec, Hgo.',
    '775 555 0131',
    'Benito Ángeles',
    40000,
    15,
    20.028,
    -98.372,
    'Ruta 09 · Santiago Tulantepec',
  ),
  c(
    'Lechería Hermanos Templos',
    'LHT960312K72',
    'Av. Juárez 310, Santiago Tulantepec, Hgo.',
    '775 555 0132',
    'Gerardo Templos',
    80000,
    15,
    20.041,
    -98.357,
    'Ruta 09 · Santiago Tulantepec',
  ),
  c(
    'Rancho Santa Cecilia',
    'RSC130822N49',
    'Camino Real a Napateco km 2, Tulancingo, Hgo.',
    '775 555 0133',
    'Cecilia Lemus',
    55000,
    15,
    20.062,
    -98.385,
    'Ruta 09 · Santiago Tulantepec',
  ),
  c(
    'Establo La Esperanza',
    'ELE020909V20',
    'Carr. Tulancingo–Pachuca km 14, Singuilucan, Hgo.',
    '775 555 0134',
    'Alma Bautista',
    110000,
    30,
    20.02,
    -98.47,
    'Ruta 09 · Santiago Tulantepec',
  ),
  c(
    'Rancho Agua Bendita',
    null,
    'Loc. Los Romeros, Santiago Tulantepec, Hgo.',
    '775 555 0135',
    'Tomás Romero',
    0,
    0,
    20.018,
    -98.35,
    'Ruta 09 · Santiago Tulantepec',
  ),

  // Oriente y norte
  c(
    'Rancho El Mirador',
    'RMI140211J65',
    'Camino a Tezoquipa s/n, Acaxochitlán, Hgo.',
    '775 555 0141',
    'Domingo Vite',
    50000,
    15,
    20.156,
    -98.207,
    'Ruta 15 · Oriente',
  ),
  c(
    'Granja Avícola Los Ángeles',
    'GAA091104S83',
    'Carr. a Metepec km 9, Metepec, Hgo.',
    '775 555 0143',
    'Leticia Franco',
    100000,
    30,
    20.222,
    -98.323,
    'Ruta 15 · Oriente',
  ),
  c(
    'José Guadalupe Trejo Islas',
    'TEIG710512Q34',
    'Loc. Santa Ana Hueytlalpan, Tulancingo, Hgo.',
    '775 555 0144',
    'José Guadalupe Trejo',
    8000,
    7,
    20.158,
    -98.288,
    'Ruta 15 · Oriente',
  ),

  // Centro
  c(
    'Ovinos del Valle S.P.R. de R.L.',
    'OVA060127C58',
    'Ejido Santa María Asunción, Tulancingo, Hgo.',
    '775 555 0151',
    'Silvia Arista',
    90000,
    30,
    20.118,
    -98.345,
    'Ruta 02 · Centro',
  ),
  c(
    'Granja Doña Chela',
    'MOGG650824L17',
    'Calle 5 de Mayo 18, Col. Huapalcalco, Tulancingo, Hgo.',
    '775 555 0152',
    'Graciela Montiel',
    15000,
    7,
    20.118,
    -98.366,
    'Ruta 02 · Centro',
  ),
  c(
    'Pollos y Huevo Don Beto',
    'CUAA780303E92',
    'Mercado Municipal, local 27, Tulancingo, Hgo.',
    '775 555 0153',
    'Alberto Curiel',
    20000,
    7,
    20.082,
    -98.367,
    'Ruta 02 · Centro',
  ),
  c(
    'Veterinaria y Forrajes El Corral',
    'VFC170619A46',
    'Av. 21 de Marzo 508, Tulancingo, Hgo.',
    '775 555 0154',
    'Iván Paredes',
    60000,
    15,
    20.09,
    -98.372,
    'Ruta 02 · Centro',
  ),
  c(
    'Margarita Hernández Cruz',
    null,
    'Calle Allende 112, Col. Centro, Tulancingo, Hgo.',
    '775 555 0155',
    'Margarita Hernández',
    0,
    0,
    20.086,
    -98.36,
    'Ruta 02 · Centro',
  ),
];

// ---------- Proveedores ----------
export interface SupplierDef {
  name: string;
  rfc: string;
  contact: string;
  phone: string;
  email: string | null;
  address: string;
  paymentDays: number;
  lines: ProductDef['line'][];
}

const s = (
  name: string,
  rfc: string,
  contact: string,
  phone: string,
  email: string | null,
  address: string,
  paymentDays: number,
  lines: ProductDef['line'][],
): SupplierDef => ({ name, rfc, contact, phone, email, address, paymentDays, lines });

export const SUPPLIERS: SupplierDef[] = [
  s(
    'Molinos del Bajío S.A. de C.V.',
    'MBA010203AB1',
    'Ing. Ricardo Pantoja',
    '442 555 0101',
    'ventas@molinosdelbajio.example',
    'Av. La Montaña 120, Parque Industrial Querétaro, Santa Rosa Jáuregui, Qro.',
    15,
    ['BOVINO', 'OVINO'],
  ),
  s('Granos y Forrajes Tula', 'GFT950612XY9', 'Elvia Cerón', '773 555 0144', null, 'Carr. Tula–Tlahuelilpan km 2.5, Tula de Allende, Hgo.', 0, [
    'AVES',
    'BOVINO',
    'OVINO',
  ]),
  s(
    'Minerales del Centro',
    'MCE000101KL4',
    'Lic. Arturo Nava',
    '55 5555 0188',
    'pedidos@mineralesdelcentro.example',
    'Calz. Vallejo 1420, Col. Industrial Vallejo, Ciudad de México',
    30,
    ['OVINO', 'BOVINO', 'AVES'],
  ),
  s(
    'Alimentos Balanceados del Altiplano S.A. de C.V.',
    'ABA970814M52',
    'Ing. Mónica Rangel',
    '771 555 0127',
    'mrangel@balanceadosaltiplano.example',
    'Blvd. Minero 305, Zona Industrial La Paz, Pachuca, Hgo.',
    21,
    ['AVES', 'OVINO', 'BOVINO'],
  ),
  s(
    'Avícola y Nutrición San Juan',
    'ANS051130T71',
    'Julio Maqueda',
    '427 555 0163',
    'ventas@nutricionsanjuan.example',
    'Av. Central 88, Zona Industrial Valle de Oro, San Juan del Río, Qro.',
    15,
    ['AVES'],
  ),
  s('Forrajes y Pacas Valle de Apan', 'FPV110418R36', 'Efraín Lugo', '748 555 0119', null, 'Carr. Apan–Calpulalpan km 4, Apan, Hgo.', 0, ['BOVINO', 'OVINO']),
  s(
    'Pastas y Oleaginosas de Oriente S.A. de C.V.',
    'POO930227H84',
    'C.P. Daniela Rosas',
    '222 555 0175',
    'cobranza@pastasdeoriente.example',
    'Calle 5 Sur 1204, Parque Industrial Puebla 2000, Puebla, Pue.',
    30,
    ['BOVINO'],
  ),
  s('Melazas y Subproductos Huasteca', 'MSH080905C19', 'Rubén Azuara', '789 555 0152', null, 'Carr. México–Tampico km 212, Huejutla de Reyes, Hgo.', 8, [
    'BOVINO',
  ]),
];

// ---------- Compras ----------
export interface PurchaseDef {
  /** Referencia que se guarda en las notas de la orden; identifica la orden para no repetirla. */
  ref: string;
  /** Folio que usaba el seed anterior, para reconocer esas órdenes en bases ya sembradas. */
  legacyFolio?: string;
  supplier: string;
  status: 'RECIBIDA' | 'ENVIADA' | 'BORRADOR';
  /** Días respecto a hoy en que se envió (negativo = pasado). */
  sent: number;
  /** Días respecto a hoy en que llegó la mercancía. */
  received?: number;
  /** Días respecto a hoy en que se espera (órdenes sin recibir). */
  expected?: number;
  /** [código, kg pedidos, costo por kg, kg recibidos (si llegó menos), nota de la diferencia] */
  items: [code: string, quantity: number, unitCost: number, received?: number, note?: string][];
  /** Cuenta por pagar abierta: días respecto a hoy en que vence. Sin este dato, la cuenta ya está pagada. */
  due?: number;
  /** Abono ya hecho a una cuenta abierta. */
  partialPayment?: number;
  receiptNotes?: string;
}

export const PURCHASES: PurchaseDef[] = [
  {
    ref: 'Pedido quincenal · cotización MB-2291',
    supplier: 'Molinos del Bajío S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -52,
    received: -49,
    items: [
      ['BV-001', 4000, 8.2],
      ['BV-003', 2000, 8.95],
      ['OV-001', 3000, 8.3],
    ],
  },
  {
    ref: 'Grano de temporada · báscula 18840',
    supplier: 'Granos y Forrajes Tula',
    status: 'RECIBIDA',
    sent: -50,
    received: -48,
    items: [
      ['AV-004', 4000, 5.7],
      ['AV-010', 5000, 5.6],
      ['BV-013', 2000, 6.75],
    ],
  },
  {
    ref: 'Línea de aves · cotización AB-0774',
    supplier: 'Alimentos Balanceados del Altiplano S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -47,
    received: -44,
    items: [
      ['AV-001', 3000, 7.3],
      ['AV-003', 1500, 7.9],
      ['OV-008', 800, 8.6],
      ['AV-009', 200, 10.2],
    ],
  },
  {
    ref: 'Sales y minerales · pedido 4471',
    supplier: 'Minerales del Centro',
    status: 'RECIBIDA',
    sent: -45,
    received: -43,
    items: [
      ['OV-002', 1000, 7.45],
      ['BV-011', 300, 13.5],
      ['BV-002', 500, 9.4],
      ['AV-014', 500, 3.7],
    ],
  },
  {
    ref: 'Pacas de alfalfa y avena · remisión 0612',
    supplier: 'Forrajes y Pacas Valle de Apan',
    status: 'RECIBIDA',
    sent: -41,
    received: -40,
    items: [
      ['BV-009', 2500, 5.45],
      ['BV-014', 880, 5],
      ['BV-010', 1200, 3.3],
    ],
  },
  {
    ref: 'Pasta de soya y salvado · contrato PO-318',
    supplier: 'Pastas y Oleaginosas de Oriente S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -38,
    received: -35,
    items: [
      ['BV-006', 2000, 10.4],
      ['BV-007', 1500, 5.3],
    ],
  },
  {
    ref: 'Pollo de engorda · pedido SJ-1502',
    supplier: 'Avícola y Nutrición San Juan',
    status: 'RECIBIDA',
    sent: -33,
    received: -31,
    items: [
      ['AV-002', 1500, 9.35],
      ['AV-005', 1600, 8.9],
      ['AV-006', 1600, 8.7],
      ['AV-007', 600, 9.2],
    ],
  },
  {
    ref: 'Pedido quincenal · cotización MB-2337',
    supplier: 'Molinos del Bajío S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -30,
    received: -27,
    items: [
      ['BV-001', 3000, 8.3],
      ['OV-004', 2000, 8.7],
      ['BV-005', 1600, 7.65],
      ['BV-004', 1200, 9.7],
    ],
  },
  {
    ref: 'Grano de temporada · báscula 19127',
    supplier: 'Granos y Forrajes Tula',
    status: 'RECIBIDA',
    sent: -24,
    received: -22,
    items: [
      ['AV-010', 4000, 5.75],
      ['AV-011', 2000, 5.25],
      ['BV-012', 2000, 6.45],
      ['OV-007', 1600, 6.2],
      ['AV-012', 1200, 6.5],
      ['AV-013', 500, 10.3],
    ],
  },
  {
    ref: 'Reposición de postura y engorda · cotización AB-0819',
    supplier: 'Alimentos Balanceados del Altiplano S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -20,
    received: -18,
    items: [
      ['AV-001', 3000, 7.45],
      ['BV-001', 1200, 8.55],
      ['OV-001', 2000, 8.45],
      ['AV-008', 500, 9.55],
    ],
    due: 5,
    partialPayment: 20000,
  },
  {
    ref: 'Pedido quincenal · cotización MB-2384',
    supplier: 'Molinos del Bajío S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -16,
    received: -14,
    items: [
      ['OV-001', 2000, 8.45],
      ['BV-003', 1600, 9.1],
      ['OV-005', 1600, 7.8],
      ['OV-003', 1200, 9.4],
    ],
    due: 2,
  },
  {
    ref: 'Sales y minerales · pedido 4538',
    legacyFolio: 'OC-DEMO3',
    supplier: 'Minerales del Centro',
    status: 'RECIBIDA',
    sent: -12,
    received: -11,
    items: [
      ['OV-002', 800, 7.6],
      ['OV-009', 120, 53.5],
      ['OV-006', 200, 13],
    ],
    due: 19,
  },
  {
    ref: 'Melaza a granel · remisión H-207',
    supplier: 'Melazas y Subproductos Huasteca',
    status: 'RECIBIDA',
    sent: -10,
    received: -8,
    items: [['BV-008', 600, 4.6, 450, 'Llegaron 15 porrones de 20; el resto no se surte']],
    receiptNotes: 'Entrega incompleta: la pipa del proveedor no alcanzó a llenar.',
  },
  {
    ref: 'Pasta de soya · contrato PO-341',
    supplier: 'Pastas y Oleaginosas de Oriente S.A. de C.V.',
    status: 'RECIBIDA',
    sent: -9,
    received: -6,
    items: [['BV-006', 1600, 10.6]],
    due: 24,
  },
  {
    ref: 'Maíz quebrado · báscula 19356',
    legacyFolio: 'OC-DEMO2',
    supplier: 'Granos y Forrajes Tula',
    status: 'RECIBIDA',
    sent: -8,
    received: -7,
    items: [['AV-004', 3000, 5.9, 2800, 'Faltaron 200 kg según báscula']],
    receiptNotes: 'Pesado en báscula propia: 2,800 kg.',
    due: -3,
  },
  {
    ref: 'Pedido quincenal · cotización MB-2431',
    legacyFolio: 'OC-DEMO1',
    supplier: 'Molinos del Bajío S.A. de C.V.',
    status: 'ENVIADA',
    sent: -4,
    expected: 2,
    items: [
      ['BV-001', 2000, 8.4],
      ['BV-003', 1200, 9.1],
    ],
  },
  {
    ref: 'Melaza a granel · remisión pendiente',
    supplier: 'Melazas y Subproductos Huasteca',
    status: 'ENVIADA',
    sent: -2,
    expected: 1,
    items: [['BV-008', 600, 4.7]],
  },
  {
    ref: 'Codorniz y postura · por confirmar precio',
    supplier: 'Alimentos Balanceados del Altiplano S.A. de C.V.',
    status: 'BORRADOR',
    sent: 0,
    items: [
      ['AV-009', 200, 10.4],
      ['AV-001', 2000, 7.45],
    ],
  },
];

// ---------- Ruta de hoy (la que usa el chofer en la demostración y en las pruebas) ----------
export const TODAY_STOPS: {
  customer: string;
  eta: string;
  terms: string;
  note: string | null;
  items: [code: string, presentation: string, quantity: number][];
}[] = [
  {
    customer: 'Rancho San Miguel',
    eta: '08:30',
    terms: 'Contado',
    note: null,
    items: [
      ['BV-001', 'Saco 40 kg', 5],
      ['BV-011', 'Bloque 10 kg', 2],
    ],
  },
  { customer: 'Borregos La Loma', eta: '09:15', terms: 'Crédito 15 días', note: null, items: [['OV-001', 'Saco 40 kg', 3]] },
  {
    customer: 'Establo Los Pinos',
    eta: '10:05',
    terms: 'Contado',
    note: 'Descargar en el corral 2, junto al silo. Preguntar por Don Raúl.',
    items: [
      ['BV-001', 'Saco 40 kg', 4],
      ['BV-006', 'Saco 40 kg', 2],
    ],
  },
  // la parada 4 lleva un solo producto: la prueba del repartidor hace con ella la entrega parcial
  { customer: 'Granja Avícola Sol', eta: '10:40', terms: 'Crédito 30 días', note: null, items: [['AV-001', 'Saco 40 kg', 6]] },
  {
    customer: 'Rancho El Encino',
    eta: '11:20',
    terms: 'Contado',
    note: 'Portón verde; tocar el claxon.',
    items: [
      ['AV-001', 'Saco 40 kg', 3],
      ['AV-004', 'Saco 40 kg', 2],
    ],
  },
];

/** Productos que se reparten a domicilio (sacos y pacas), con su peso relativo en los pedidos. */
export const ROUTE_PRODUCTS: [code: string, presentation: string, weight: number][] = [
  ['BV-001', 'Saco 40 kg', 6],
  ['BV-003', 'Saco 40 kg', 3],
  ['BV-006', 'Saco 40 kg', 2],
  ['BV-009', 'Paca 25 kg', 3],
  ['BV-013', 'Saco 40 kg', 2],
  ['OV-001', 'Saco 40 kg', 5],
  ['OV-004', 'Saco 40 kg', 2],
  ['OV-002', 'Saco 20 kg', 1],
  ['AV-001', 'Saco 40 kg', 5],
  ['AV-005', 'Saco 40 kg', 2],
  ['AV-010', 'Saco 50 kg', 3],
  ['AV-004', 'Saco 40 kg', 2],
];

export const STOP_NOTES = [
  'Entregar en la bodega del fondo.',
  'Avisar por teléfono 10 minutos antes.',
  'Recibe el encargado; pedir firma y sello.',
  'Camino de terracería: entrar despacio.',
  'Descargar junto a los comederos.',
];
