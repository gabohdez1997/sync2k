// src/lib/server/services/hkaTracking.ts
// Servicio de trazabilidad de Facturas Electrónicas emitidas en The Factory HKA
// Previene duplicados, almacena números de control SENIAT y links a comprobantes digitales.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getSupabaseAdmin } from '$lib/server/supabase';
import { logAction } from '$lib/server/audit';

export interface EmittedHkaInvoice {
  id: string; // ID único interno o UUID
  profit_doc_num?: string; // Correlativo en Profit Plus (saFacturaVenta.doc_num)
  id_servicio?: number | null; // ID de servicio si proviene de WispHub / ISP
  periodo?: string; // Formato 'YYYY-MM', e.g. '2026-11'
  cliente_nombre: string;
  cliente_cedula: string;
  tipo_identificacion?: string;
  numero_identificacion?: string;
  tipo_documento: string; // '01' Factura, '02' Nota Débito, '03' Nota Crédito
  serie: string;
  numero_documento: string; // Correlativo fiscal asignado por HKA
  numero_control: string; // Número de control SENIAT (ej: 00-00000007)
  rango_asignado?: string;
  url_consulta?: string; // Link de verificación pública con QR
  imprenta_digital?: string;
  monto_usd?: number;
  monto_ves: number;
  base_imponible_ves: number;
  iva_ves: number;
  tasa_bcv?: number;
  tasa_bcv_fecha?: string;
  hka_codigo: string;
  hka_mensaje: string;
  hka_fecha_asignacion?: string;
  hka_hora_asignacion?: string;
  created_at: string;
  created_by?: string;
  raw_resultado?: any;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const INVOICES_FILE = path.join(DATA_DIR, 'hka_emitted_invoices.json');

/**
 * Obtiene el código de período mensual 'YYYY-MM'
 */
export function getInvoicePeriod(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 7);
  return d.toISOString().slice(0, 7);
}

/**
 * Retorna el nombre legible del mes y año (ej: "Noviembre 2026")
 */
export function formatPeriodName(periodo: string): string {
  const parts = periodo.split('-');
  if (parts.length < 2) return periodo;
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const m = parseInt(parts[1], 10);
  const year = parts[0];
  if (m >= 1 && m <= 12) {
    return `${monthNames[m - 1]} ${year}`;
  }
  return periodo;
}

// Memory cache para entornos serverless
let invoicesCache: EmittedHkaInvoice[] | null = null;

function readLocalInvoices(): EmittedHkaInvoice[] {
  if (invoicesCache) return invoicesCache;
  try {
    if (fs.existsSync(INVOICES_FILE)) {
      const raw = fs.readFileSync(INVOICES_FILE, 'utf-8');
      invoicesCache = JSON.parse(raw);
      return invoicesCache!;
    }
  } catch (err) {
    console.warn('[HKA TRACKING] Fallback local no legible:', err);
  }
  invoicesCache = [];
  return invoicesCache;
}

function writeLocalInvoices(list: EmittedHkaInvoice[]) {
  invoicesCache = list;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(INVOICES_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[HKA TRACKING] No se pudo guardar archivo local:', err);
  }
}

/**
 * Registra una factura emitida exitosamente en HKA para trazabilidad y auditoría
 */
export async function recordEmittedHkaInvoice(
  invoice: Omit<EmittedHkaInvoice, 'id' | 'created_at'> & { id?: string },
  fetchFn?: typeof fetch
): Promise<EmittedHkaInvoice> {
  const now = new Date().toISOString();
  const record: EmittedHkaInvoice = {
    id: invoice.id || `HKA-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    ...invoice,
    periodo: invoice.periodo || getInvoicePeriod(invoice.hka_fecha_asignacion || now),
    created_at: now
  };

  // 1. Guardar localmente
  const local = readLocalInvoices();
  // Evitar duplicados por id o numero_documento en la misma serie
  const existingIdx = local.findIndex(
    (i) => i.id === record.id || (i.serie === record.serie && i.numero_documento === record.numero_documento)
  );
  if (existingIdx >= 0) {
    local[existingIdx] = record;
  } else {
    local.unshift(record);
  }
  writeLocalInvoices(local);

  // 2. Intentar guardar en Supabase (si existe la tabla)
  const supabase = getSupabaseAdmin(fetchFn);
  try {
    await supabase.from('hka_emitted_invoices').upsert(record);
  } catch (e) {
    // Si la tabla no está creada, continúa silenciosamente con el fallback
  }

  return record;
}

/**
 * Consulta todas las facturas emitidas por HKA con filtrado opcional por período o búsqueda
 */
export async function getEmittedHkaInvoices(
  options?: {
    periodo?: string;
    search?: string;
    limit?: number;
  },
  fetchFn?: typeof fetch
): Promise<EmittedHkaInvoice[]> {
  const supabase = getSupabaseAdmin(fetchFn);
  let list: EmittedHkaInvoice[] = [];

  try {
    let q = supabase
      .from('hka_emitted_invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.periodo) {
      q = q.eq('periodo', options.periodo);
    }
    if (options?.limit) {
      q = q.limit(options.limit);
    }

    const { data, error } = await q;
    if (!error && Array.isArray(data) && data.length > 0) {
      list = data;
    } else {
      list = readLocalInvoices();
    }
  } catch {
    list = readLocalInvoices();
  }

  if (options?.periodo) {
    list = list.filter((i) => i.periodo === options.periodo);
  }

  if (options?.search) {
    const s = options.search.toLowerCase().trim();
    list = list.filter(
      (i) =>
        i.cliente_nombre.toLowerCase().includes(s) ||
        i.cliente_cedula.toLowerCase().includes(s) ||
        i.numero_documento.includes(s) ||
        i.numero_control.toLowerCase().includes(s) ||
        (i.profit_doc_num && i.profit_doc_num.toLowerCase().includes(s))
    );
  }

  return list;
}

/**
 * Verifica si ya existe una factura fiscal emitida para el mismo cliente/servicio y monto en el período
 */
export async function findDuplicateHkaInvoice(
  cedulaOrServiceId: string | number,
  periodo: string,
  montoUsd?: number
): Promise<EmittedHkaInvoice | null> {
  const all = readLocalInvoices();
  const searchKey = String(cedulaOrServiceId).trim().toUpperCase();

  const match = all.find((inv) => {
    const matchPeriod = inv.periodo === periodo;
    const matchEntity =
      (inv.id_servicio && String(inv.id_servicio) === searchKey) ||
      inv.cliente_cedula.toUpperCase() === searchKey ||
      (inv.numero_identificacion && inv.numero_identificacion === searchKey.replace(/[^0-9]/g, ''));

    if (!matchPeriod || !matchEntity) return false;

    // Si se pasa monto, verificar igualdad con tolerancia de 0.05
    if (montoUsd !== undefined && inv.monto_usd !== undefined) {
      return Math.abs(inv.monto_usd - montoUsd) < 0.05;
    }

    return true;
  });

  return match || null;
}

