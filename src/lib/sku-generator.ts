import { prisma } from './prisma';

/**
 * Genera un SKU automático basado en categoría siguiendo un modelo "Semi-descriptivo".
 * 
 * Formato: PREFIJO-FAMILIA_NUMERICA
 * - PREFIJO: Siglas de la empresa (ej. 2RL).
 * - FAMILIA_NUMERICA: Rango de miles según categoría (ej. 3000 para soportes) + un secuencial.
 * 
 * Ejemplos:
 *   "Soporte Televisor" → 2RL-3001
 *   "Cable HDMI" → 2RL-1001
 */

const COMPANY_PREFIX = process.env.COMPANY_PREFIX || '2RL';

// Mapa de palabras clave a su familia numérica base.
// Cada familia tiene un rango de 1000 números (ej. 3000 a 3999).
//
// NOTA: Este mapa se usa para:
//   1. Clasificar RUTAS de categoría de MercadoLibre (via classifyByCategoryPath) ← vía principal e inteligente
//   2. Como FALLBACK sobre el título del producto cuando ML no envía categoryPath
//
// Priorizar siempre la mejora de classifyByCategoryPath antes que agregar keywords aquí.
const CATEGORY_FAMILY_MAP: Record<string, number> = {
  // 1000: Cables y conexiones
  cable: 1000,
  usb: 1000,
  ethernet: 1000,
  audio: 1000,
  video: 1000,
  alargador: 1000,
  extension: 1000,

  // 2000: Adaptadores y cargadores
  adaptador: 2000,
  cargador: 2000,
  carga: 2000,
  fuente: 2000,
  poder: 2000,
  transformador: 2000,

  // 3000: Soportes y bases
  soporte: 3000,
  base: 3000,
  pedestal: 3000,
  montaje: 3000,
  bracket: 3000,
  stand: 3000,

  // 4000: Pantallas y video
  televisor: 4000,
  tv: 4000,
  monitor: 4000,
  pantalla: 4000,

  // 5000: Accesorios, deportes y juguetes
  accesorio: 5000,
  accesorios: 5000,
  deportes: 5000,
  fitness: 5000,
  deportivo: 5000,
  deportiva: 5000,
  funda: 5000,
  case: 5000,
  cubre: 5000,
  bolso: 5000,
  mochila: 5000,
  correa: 5000,
  pelota: 5000,
  aro: 5000,
  lente: 5000,
  juguete: 5000,
  juego: 5000,
  lapiz: 5000,
  lapices: 5000,
  marcador: 5000,
  mascota: 5000,
  mascotas: 5000,
  animales: 5000,
  vehiculo: 5000,
  vehiculos: 5000,
  automotriz: 5000,
  musica: 5000,
  instrumento: 5000,
  instrumentos: 5000,
  pesa: 5000,
  kettlebell: 5000,
  rodillera: 5000,
  balance: 5000,
  ejercicio: 5000,
  alfombrilla: 5000,

  // 6000: Ropa y vestuario
  polera: 6000,
  camiseta: 6000,
  camisa: 6000,
  poleron: 6000,
  chaqueta: 6000,
  parka: 6000,

  // 7000: Calzado
  zapatilla: 7000,
  zapato: 7000,
  zapatero: 7000,
  sandalia: 7000,
  bota: 7000,

  // 8000: Pantalones y cintura
  pantalon: 8000,
  jeans: 8000,
  short: 8000,
  cinturon: 8000,
  vestir: 8000,

  // 10000: Electrónica y tecnología
  electronico: 10000,
  computacion: 10000,
  celular: 10000,
  celulares: 10000,
  telefono: 10000,
  telefonos: 10000,
  camaras: 10000,
  electronica: 10000,
  camara: 10000,
  seguridad: 10000,
  inversor: 10000,
  bateria: 10000,
  parlante: 10000,
  audifono: 10000,
  microfono: 10000,
  router: 10000,
  wifi: 10000,
  multigroom: 10000,
  consola: 10000,
  teclado: 10000,
  mouse: 10000,
  computador: 10000,
  notebook: 10000,
  reloj: 10000,
  smart: 10000,
  drone: 10000,
  roku: 10000,
  proyector: 10000,
  disco: 10000,
  memoria: 10000,
  ssd: 10000,

  // 11000: Electrodomésticos, cocina y cuidado personal
  electrodomestico: 11000,
  cocina: 11000,
  anafe: 11000,
  tostadora: 11000,
  hervidor: 11000,
  procesadora: 11000,
  batidora: 11000,
  licuadora: 11000,
  horno: 11000,
  microondas: 11000,
  refrigerador: 11000,
  lavadora: 11000,
  aspiradora: 11000,
  afeitadora: 11000,
  bascula: 11000,
  plancha: 11000,
  cafetera: 11000,
  parrilla: 11000,
  parrillera: 11000,
  freidora: 11000,
  robot: 11000,
  olla: 11000,
  sarten: 11000,
  ventilador: 11000,
  calefactor: 11000,
  estufa: 11000,
  purificador: 11000,
  limpia: 11000,
  limpieza: 11000,
  vapor: 11000,
  timer: 11000,
  temporizador: 11000,

  // 12000: Hogar, decoración y ropa de cama
  hogar: 12000,
  mueble: 12000,
  muebles: 12000,
  decoracion: 12000,
  cobertor: 12000,
  frazada: 12000,
  almohada: 12000,
  sabana: 12000,
  cortina: 12000,
  alfombra: 12000,
  colchon: 12000,
  toalla: 12000,
  cojin: 12000,
  colcha: 12000,
  edredon: 12000,
  vaso: 12000,
  termico: 12000,

  // 13000: Iluminación
  iluminacion: 13000,
  lampara: 13000,
  lamp: 13000,
  luz: 13000,
  foco: 13000,
  ampolleta: 13000,

  // 14000: Organización, herramientas y muebles
  organizador: 14000,
  estante: 14000,
  repisa: 14000,
  escurridor: 14000,
  herramienta: 14000,
  herramientas: 14000,
  escalera: 14000,
  silla: 14000,
  mesa: 14000,
  escritorio: 14000,
  banco: 14000,
  caja: 14000,
  basurero: 14000,
  nivel: 14000,


  // 15000: Kits y combos
  kit: 15000,
  pack: 15000,
  combo: 15000,
  set: 15000,
  lote: 15000,

  // 17000: Papelería y oficina
  papel: 17000,
  papeleria: 17000,
  oficina: 17000,
  calculadora: 17000,
  guillotina: 17000,
  etiqueta: 17000,
  termolaminar: 17000,
  selladora: 17000,
  contador: 17000,
  laminar: 17000,

  // 16000: Cuidado personal, perfumería y belleza
  belleza: 16000,
  "cuidado personal": 16000,
  perfume: 16000,
  colonia: 16000,
  maquillaje: 16000,
  crema: 16000,
  champu: 16000,
  shampoo: 16000,
  desodorante: 16000,
  jabon: 16000,
  protector: 16000,
  labial: 16000,
  esmalte: 16000,
  cepillo: 16000,
  peine: 16000,
  secador: 16000,
  alisador: 16000,
  rasuradora: 16000,
  cortapelo: 16000,
  tonico: 16000,
  serum: 16000,
  rimel: 16000,
  delineador: 16000,
  sombra: 16000,
  corrector: 16000,
  polvo: 16000,
  bronceador: 16000,
  exfoliante: 16000,
  hidratante: 16000,
  contorno: 16000,
  repelente: 16000,
  bloqueador: 16000,
  gel: 16000,
  espuma: 16000,
  balsamo: 16000,
  tratamiento: 16000,
  mascarilla: 16000,
  locion: 16000,
  masajeador: 16000,
  maquinilla: 16000,
  irrigador: 16000,
  bucal: 16000,
  dental: 16000,
};

/**
 * Mapa de categorías RAÍZ de MercadoLibre a nuestras familias.
 * ML tiene ~2,500 categorías estandarizadas. Las raíces (primer nivel)
 * son la señal más confiable para clasificar.
 *
 * Se usa en classifyByCategoryPath como paso 1.
 * Formato: keyword → familia (igual que CATEGORY_FAMILY_MAP)
 */
const ML_ROOT_CATEGORY_MAP: Record<string, number> = {
  // Electrónica
  electronica: 10000,
  computacion: 10000,
  celulares: 10000,
  camaras: 10000,
  videojuegos: 10000,

  // Electrodomésticos / Hogar
  electrodomesticos: 11000,

  "linea blanca": 11000,
  cocina: 11000,

  // Hogar
  hogar: 12000,
  muebles: 12000,
  decoracion: 12000,
  cama: 12000,
  blanco: 12000,

  // Deportes / Juguetes / Accesorios
  deportes: 5000,
  fitness: 5000,
  juguetes: 5000,
  mascotas: 5000,
  vehiculos: 14000,
  autos: 14000,
  "instrumentos musicales": 5000,
  musica: 5000,

  // Ropa / Calzado
  ropa: 6000,

  zapatos: 7000,
  "calzado deportivo": 7000,
  bolsos: 5000,
  carteras: 5000,

  // Belleza / Salud
  belleza: 16000,
  "cuidado personal": 16000,
  salud: 16000,
  "equipamiento medico": 16000,

  // Herramientas / Industria
  herramientas: 14000,
  industria: 14000,
  ferreteria: 14000,

  // Iluminación
  iluminacion: 13000,


  // Bebés
  bebes: 5000,


  // Alimentos
  alimentos: 11000,

  // Papelería / Oficina
  "papeleria y oficina": 17000,
  "papeleria": 17000,
  "oficina": 17000,
  "libreria": 17000,
  "material de oficina": 17000,
};

/**
 * Normaliza un texto: lowercase + quita tildes + quita caracteres especiales
 */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Palabras que indican que "herramienta" en el contexto NO es una herramienta real
 *  Ej: "Herramientas de Maquillaje" → belleza, no herramientas
 *      "Aplicadores y Herramientas para Cocina" → cocina, no herramientas
 */
const HERRAMIENTA_EXCLUSION_TERMS = [
  'maquillaje', 'belleza', 'cuidado personal', 'cosmetica',
  'cocina', 'reposteria', 'repostero',
  'limpieza', 'aseo', 'higiene',
  'jardin', 'jardineria',
  'peluqueria', 'barberia', 'estetica',
  'uñas', 'manicura', 'pedicura',
];

/** Set de keywords a excluir cuando "herramienta" está en contexto NO de herramientas */
const WITHOUT_HERRAMIENTA = new Set(['herramienta', 'herramientas']);

/**
 * Busca keywords del mapa en el texto.
 * 
 * @param text Texto a analizar
 * @param excludeKeywords Keywords a excluir (opcional)
 * @param longestMatch Si es true, retorna el keyword MÁS LARGO (más específico).
 *                     Si es false (default), retorna el primer match.
 *                     Útil para category paths donde "electronica" (11 chars)
 *                     debe ganar sobre "audio" (5 chars) en "Electrónica, Audio y Video".
 */
function matchKeywords(text: string, excludeKeywords?: Set<string>, longestMatch: boolean = false): number {
  const lower = normalize(text);
  let bestMatch = 9000;
  let bestLength = 0;

  for (const [keyword, base] of Object.entries(CATEGORY_FAMILY_MAP)) {
    if (excludeKeywords?.has(keyword)) continue;
    if (lower.includes(keyword)) {
      if (longestMatch) {
        if (keyword.length > bestLength) {
          bestLength = keyword.length;
          bestMatch = base;
        }
      } else {
        return base;
      }
    }
  }

  return bestMatch;
}

/**
 * Verifica si "herramienta" aparece en un contexto que NO es de herramientas reales.
 * Ej: "Herramientas de Maquillaje" → true (no es herramienta real)
 *     "Herramientas Eléctricas" → false (sí es herramienta real)
 */
function isHerramientaInNonToolContext(text: string): boolean {
  const lower = normalize(text);

  if (!lower.includes('herramienta')) return false;

  return HERRAMIENTA_EXCLUSION_TERMS.some(term => lower.includes(term));
}

/**
 * Busca keywords del ML_ROOT_CATEGORY_MAP en el texto (modo longestMatch).
 * Retorna la familia o 9000 si no encuentra.
 */
function matchRootCategory(text: string): number {
  const lower = normalize(text);
  let bestMatch = 9000;
  let bestLength = 0;

  for (const [keyword, base] of Object.entries(ML_ROOT_CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      if (keyword.length > bestLength) {
        bestLength = keyword.length;
        bestMatch = base;
      }
    }
  }

  return bestMatch;
}

/**
 * Clasifica un producto usando el path de categoría de MercadoLibre.
 * ML tiene ~2,500 categorías con nombres limpios y descriptivos,
 * mucho más confiables que los títulos de productos llenos de marcas/modelos.
 * 
 * Estrategia:
 *   1. Primero intenta con ML_ROOT_CATEGORY_MAP sobre la categoría RAÍZ
 *      (mapeo dedicado y más preciso que el CATEGORY_FAMILY_MAP genérico)
 *   2. Si falla, intenta con CATEGORY_FAMILY_MAP sobre la raíz (longestMatch)
 *   3. Como último recurso, intenta con CATEGORY_FAMILY_MAP sobre el path completo (longestMatch)
 * 
 * @param categoryPath Ej: "Deportes y Fitness > Fitness > Pesas y Mancuernas"
 * @returns Número de familia (ej. 5000) o 9000 si no reconoce
 */
export function classifyByCategoryPath(categoryPath: string): number {
  if (!categoryPath) return 9000;

  // Extraer la categoría raíz (primer nivel antes de " > ")
  const rootCategory = categoryPath.split(' > ')[0];

  // Paso 1: ML_ROOT_CATEGORY_MAP sobre la raíz (mapeo dedicado y más preciso)
  const fromRootMap = matchRootCategory(rootCategory);
  if (fromRootMap !== 9000) return fromRootMap;

  // Paso 2: Fallback a CATEGORY_FAMILY_MAP sobre la raíz (longestMatch)
  //   Ej: "Electrónica, Audio y Video" → "electronica" (11 chars) gana sobre "audio" (5 chars)
  const fromRoot = matchKeywords(rootCategory, undefined, true);
  if (fromRoot !== 9000) return fromRoot;

  // Paso 3: Fallback al path completo con CATEGORY_FAMILY_MAP
  const fullPathResult = matchKeywords(categoryPath, undefined, true);
  if (fullPathResult !== 9000) {
    // Si el resultado vino de "herramienta" pero está en contexto no-tool, intentar sin ella
    if (fullPathResult === 14000 && isHerramientaInNonToolContext(categoryPath)) {
      const withoutHerramienta = matchKeywords(categoryPath, WITHOUT_HERRAMIENTA, true);
      if (withoutHerramienta !== 9000) return withoutHerramienta;
    }
    return fullPathResult;
  }

  return 9000;
}

/**
 * Determina la familia de un producto usando múltiples señales:
 * 1. Primero intenta con el path de categoría de ML (más confiable)
 * 2. Si no, usa el título del producto con el mapa de keywords
 * 
 * @param name Título del producto
 * @param categoryPath Path de categoría ML opcional (ej: "Electrónica > Cables > HDMI")
 * @returns Número de familia (ej. 1000, 5000) o 9000 si no reconoce
 */
export function extractFamilyBase(name: string, categoryPath?: string): number {
  // Paso 1: Intentar con el path de categoría ML (señal más limpia y confiable)
  if (categoryPath) {
    const fromCategory = classifyByCategoryPath(categoryPath);
    if (fromCategory !== 9000) return fromCategory;
  }

  // Paso 2: Fallback al título del producto con el mapa de keywords (longestMatch)
  // Usamos longestMatch para que keywords más específicas (ej: "alfombrilla" 11 chars)
  // ganen sobre keywords genéricas (ej: "base" 4 chars)
  const result = matchKeywords(name, undefined, true);
  if (result !== 9000) return result;

  return 9000; // Familia genérica por defecto
}

// Se mantienen los parámetros opcionales (brand, color, size) para no romper las llamadas existentes
// en el resto de la aplicación, aunque ya no se incluyan explícitamente en el SKU final.
export async function generateSku(productName: string, brand?: string, color?: string, size?: string): Promise<string> {
  const familyBase = extractFamilyBase(productName);

  const minNum = familyBase;
  const maxNum = familyBase + 999;

  const len = String(familyBase).length;
  const numDigitsPrefix = len - 3; // 1 para miles, 2 para decenas de miles
  const searchPrefix = `${COMPANY_PREFIX}-${String(familyBase).substring(0, numDigitsPrefix)}`;

  const products = await prisma.product.findMany({
    where: {
      sku: { startsWith: searchPrefix }
    },
    select: { sku: true }
  });

  let maxFoundNum = familyBase;

  for (const p of products) {
    const match = p.sku.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= minNum && num <= maxNum) {
        if (num > maxFoundNum) {
          maxFoundNum = num;
        }
      }
    }
  }

  const nextNum = maxFoundNum + 1;
  return `${COMPANY_PREFIX}-${nextNum}`;
}
