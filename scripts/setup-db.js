#!/usr/bin/env node
// scripts/setup-db.js
// Crea la base de datos sync2k local y aplica el schema + seed
// Uso: node scripts/setup-db.js [--local-only] [--supabase-only]

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const { Client, Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '001_init_schema.sql');

// ─── Configuración ─────────────────────────────────────────────
const LOCAL_CONFIG = {
  host:     'localhost',
  port:     5432,
  user:     'postgres',
  password: process.env.PGPASSWORD || 'Galpe2021*',
  database: 'postgres'  // conectamos a postgres para crear sync2k
};

const LOCAL_DB = 'sync2k';

const SUPABASE_URL        = process.env.SUPABASE_URL        || 'https://rxtxzlzmxsjzicjuwbra.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ─── Helpers ───────────────────────────────────────────────────
function log(msg, type = 'info') {
  const prefix = { info: '🔵', ok: '✅', warn: '⚠️ ', error: '❌' }[type] || '  ';
  console.log(`${prefix} ${msg}`);
}

function readMigration() {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  log(`Migration file leído: ${MIGRATION_FILE}`, 'ok');
  return sql;
}

// ─── Paso 1: Crear database local ──────────────────────────────
async function createLocalDatabase() {
  const client = new Client(LOCAL_CONFIG);
  await client.connect();

  const { rows } = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [LOCAL_DB]
  );

  if (rows.length > 0) {
    log(`Database "${LOCAL_DB}" ya existe — omitiendo creación`, 'warn');
  } else {
    await client.query(`CREATE DATABASE "${LOCAL_DB}" ENCODING 'UTF8' LC_COLLATE 'es_ES.UTF-8' LC_CTYPE 'es_ES.UTF-8' TEMPLATE template0`);
    log(`Database "${LOCAL_DB}" creada`, 'ok');
  }

  await client.end();
}

// ─── Paso 2: Aplicar schema en PostgreSQL local ─────────────────
async function applyLocalSchema(sql) {
  const pool = new Pool({ ...LOCAL_CONFIG, database: LOCAL_DB });
  const client = await pool.connect();

  try {
    log('Aplicando schema en PostgreSQL local...');
    await client.query(sql);
    log('Schema aplicado en PostgreSQL local', 'ok');

    // Verificar tablas creadas
    const { rows } = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    log(`Tablas creadas: ${rows.map(r => r.tablename).join(', ')}`, 'ok');

    // Verificar roles seed
    const { rows: rolesRows } = await client.query('SELECT name FROM roles');
    log(`Roles iniciales: ${rolesRows.map(r => r.name).join(', ')}`, 'ok');

  } finally {
    client.release();
    await pool.end();
  }
}

// ─── Paso 3: Aplicar schema en Supabase Cloud ───────────────────
async function applySupabaseSchema(sql) {
  if (!SUPABASE_SERVICE_KEY) {
    log('SUPABASE_SERVICE_ROLE_KEY no configurada — omitiendo Supabase', 'warn');
    return false;
  }

  log('Estableciendo conexión con Supabase Cloud...');

  // Usamos el endpoint de Supabase para ejecutar SQL via Management API
  // Para DDL necesitamos la conexión directa — en este caso las tablas
  // las creamos en batch usando el REST API pattern

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Verificar conexión
  const { error: pingError } = await supabase.from('profiles').select('id').limit(1);

  if (pingError && pingError.code === '42P01') {
    // Tabla no existe — necesitamos usar el SQL Editor de Supabase
    log('Las tablas no existen en Supabase Cloud.', 'warn');
    log('Por favor ejecuta manualmente el SQL en:', 'warn');
    log(`https://supabase.com/dashboard/project/rxtxzlzmxsjzicjuwbra/sql/new`, 'warn');
    log('(El archivo SQL está en: supabase/migrations/001_init_schema.sql)', 'warn');
    return false;
  } else if (!pingError || pingError.code === 'PGRST116') {
    log('✅ Tablas ya existen en Supabase Cloud', 'ok');
    return true;
  }

  log(`Supabase: ${pingError?.message}`, 'warn');
  return false;
}

// ─── Paso 4: Verificar conectividad completa ────────────────────
async function verifySetup() {
  log('\n─── Verificación final ───────────────────────────────');

  // Local PostgreSQL
  const pool = new Pool({ ...LOCAL_CONFIG, database: LOCAL_DB });
  try {
    const { rows } = await pool.query('SELECT * FROM profile_complete LIMIT 0');
    log('Vista profile_complete OK en local', 'ok');

    const { rows: branches } = await pool.query('SELECT * FROM branches');
    log(`Sucursales configuradas: ${branches.length} (Sede Galpe)`, 'ok');

    const { rows: roles } = await pool.query(
      'SELECT name, array_length(branch_ids, 1) as branches, array_length(warehouse_ids, 1) as warehouses FROM roles'
    );
    log(`Roles creados:`, 'ok');
    roles.forEach(r => log(`  → ${r.name}`, 'ok'));

  } catch (err) {
    log(`Error verificando local: ${err.message}`, 'error');
  } finally {
    await pool.end();
  }

  // Supabase Cloud
  if (SUPABASE_SERVICE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await supabase.from('roles').select('name');
    if (error) {
      log(`Supabase Cloud: pendiente de migración manual (${error.message})`, 'warn');
    } else {
      log(`Supabase Cloud: ${data.length} roles encontrados`, 'ok');
    }
  }

  log('\n─── Setup completado ─────────────────────────────────');
  log('Próximo paso: crear usuario administrador con:');
  log('  node scripts/create-admin.js');
}

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const localOnly    = args.includes('--local-only');
  const supabaseOnly = args.includes('--supabase-only');

  log('═══ Sync2K — Setup de Base de Datos ═══════════════════');
  log(`Modo: ${localOnly ? 'Solo local' : supabaseOnly ? 'Solo Supabase' : 'Completo (local + Supabase)'}`);
  log('');

  const sql = readMigration();

  if (!supabaseOnly) {
    log('─── PostgreSQL Local ──────────────────────────────────');
    try {
      await createLocalDatabase();
      await applyLocalSchema(sql);
    } catch (err) {
      log(`Error en PostgreSQL local: ${err.message}`, 'error');
      console.error(err);
    }
  }

  if (!localOnly) {
    log('\n─── Supabase Cloud ────────────────────────────────────');
    try {
      await applySupabaseSchema(sql);
    } catch (err) {
      log(`Error en Supabase: ${err.message}`, 'error');
      console.error(err);
    }
  }

  await verifySetup();
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
