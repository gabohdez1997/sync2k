#!/usr/bin/env node
// scripts/sync-daemon.mjs
// Daemon de sincronización bidireccional entre Supabase Cloud y PostgreSQL Local.
// Diseñado para ejecutarse periódicamente (ej: cron cada 15 min o pm2).
//
// Modo Offline-First:
//   - Cloud a Local (Downsync): Perfiles, Roles, User_Roles, Branches (Cloud es maestro)
//   - Local a Cloud (Upsync): Audit Log offline

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Cargar variables de entorno del .env en la raíz
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const { Pool } = pg;

// ─── Configuración ─────────────────────────────────────────────
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOCAL_PG_URL = process.env.LOCAL_PG_URL || 'postgresql://postgres:Galpe2021*@localhost:5432/sync2k';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan credenciales de Supabase en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const localPool = new Pool({ connectionString: LOCAL_PG_URL });

// ─── Helpers ───────────────────────────────────────────────────
async function getLastSyncTime(client, table) {
  const { rows } = await client.query(`SELECT MAX(updated_at) as last_updated FROM ${table}`);
  let last = rows[0]?.last_updated;
  if (last && last instanceof Date) return last.toISOString();
  return last || new Date(0).toISOString();
}

// ─── Lógica de Sincronización ──────────────────────────────────
async function runSync() {
  const localClient = await localPool.connect();
  let syncStatus = 'success';
  let tablesSynced = [];
  let recordsSynced = 0;
  let errorMsg = null;

  console.log(`\n[${new Date().toISOString()}] 🔄 Iniciando sincronización Cloud ↔ Local...`);

  try {
    // ==========================================
    // 1. DOWNSYNC (Cloud -> Local)
    // ==========================================
    
    // Tabla: ROLES
    console.log('   Sincronizando roles...');
    const lastRoleUpdate = await getLastSyncTime(localClient, 'roles');
    const { data: cloudRoles, error: errRoles } = await supabase
      .from('roles')
      .select('*')
      .gt('updated_at', lastRoleUpdate);

    if (errRoles) throw errRoles;

    if (cloudRoles && cloudRoles.length > 0) {
      for (const role of cloudRoles) {
        await localClient.query(`
          INSERT INTO roles (id, name, permissions, branch_ids, warehouse_ids, updated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            permissions = EXCLUDED.permissions,
            branch_ids = EXCLUDED.branch_ids,
            warehouse_ids = EXCLUDED.warehouse_ids,
            updated_at = EXCLUDED.updated_at
        `, [role.id, role.name, role.permissions, role.branch_ids, role.warehouse_ids, role.updated_at, role.created_at]);
      }
      tablesSynced.push('roles');
      recordsSynced += cloudRoles.length;
      console.log(`   ✓ ${cloudRoles.length} roles sincronizados.`);
    }

    // Tabla: BRANCHES
    console.log('   Sincronizando sucursales...');
    const lastBranchUpdate = await getLastSyncTime(localClient, 'branches');
    const { data: cloudBranches, error: errBranches } = await supabase
      .from('branches')
      .select('*')
      .gt('updated_at', lastBranchUpdate);

    if (errBranches) throw errBranches;

    if (cloudBranches && cloudBranches.length > 0) {
      for (const branch of cloudBranches) {
        await localClient.query(`
          INSERT INTO branches (id, name, agent_url, agent_token, profit_branch_codes, sql_config, profit_server_id, local_dns_alias, active, sort_order, updated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            agent_url = EXCLUDED.agent_url,
            agent_token = EXCLUDED.agent_token,
            profit_branch_codes = EXCLUDED.profit_branch_codes,
            sql_config = EXCLUDED.sql_config,
            profit_server_id = EXCLUDED.profit_server_id,
            local_dns_alias = EXCLUDED.local_dns_alias,
            active = EXCLUDED.active,
            sort_order = EXCLUDED.sort_order,
            updated_at = EXCLUDED.updated_at
        `, [branch.id, branch.name, branch.agent_url, branch.agent_token, JSON.stringify(branch.profit_branch_codes), JSON.stringify(branch.sql_config), branch.profit_server_id, branch.local_dns_alias, branch.active, branch.sort_order, branch.updated_at, branch.created_at]);
      }
      tablesSynced.push('branches');
      recordsSynced += cloudBranches.length;
      console.log(`   ✓ ${cloudBranches.length} sucursales sincronizadas.`);
    }

    // Tabla: PROFILES & USER_ROLES
    console.log('   Sincronizando perfiles de usuario...');
    const lastProfileUpdate = await getLastSyncTime(localClient, 'profiles');
    const { data: cloudProfiles, error: errProfiles } = await supabase
      .from('profiles')
      .select('*, user_roles(role_id)') // Join para traer los roles
      .gt('updated_at', lastProfileUpdate);

    if (errProfiles) throw errProfiles;

    if (cloudProfiles && cloudProfiles.length > 0) {
      await localClient.query('BEGIN'); // Transacción para consistencia
      for (const profile of cloudProfiles) {
        // Upsert Profile
        await localClient.query(`
          INSERT INTO profiles (id, full_name, email, password_hash, profit_user, profit_pass, active, updated_at, created_at, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            profit_user = EXCLUDED.profit_user,
            profit_pass = EXCLUDED.profit_pass,
            active = EXCLUDED.active,
            updated_at = EXCLUDED.updated_at,
            synced_at = NOW()
        `, [profile.id, profile.full_name, profile.email, profile.password_hash, profile.profit_user, profile.profit_pass, profile.active, profile.updated_at, profile.created_at]);

        // Sincronizar roles asociados
        await localClient.query(`DELETE FROM user_roles WHERE user_id = $1`, [profile.id]);
        
        const roles = profile.user_roles || [];
        for (const ur of roles) {
          await localClient.query(`
            INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING
          `, [profile.id, ur.role_id]);
        }
      }
      await localClient.query('COMMIT');
      
      tablesSynced.push('profiles', 'user_roles');
      recordsSynced += cloudProfiles.length;
      console.log(`   ✓ ${cloudProfiles.length} perfiles sincronizados.`);
    }

    // ==========================================
    // 2. UPSYNC (Local -> Cloud) Ej: Audit log
    // ==========================================
    // Se podría enviar la bitácora offline generada localmente hacia la nube aquí.
    
    // Registrar éxito
    if (recordsSynced > 0) {
      await localClient.query(`
        INSERT INTO sync_log (direction, status, tables_synced, records_synced, finished_at)
        VALUES ('cloud_to_local', 'success', $1, $2, NOW())
      `, [tablesSynced, recordsSynced]);
    }
    
    console.log(`[${new Date().toISOString()}] ✅ Sincronización completada.`);

  } catch (err) {
    syncStatus = 'error';
    errorMsg = err.message;
    console.error(`[${new Date().toISOString()}] ❌ Error de sincronización:`, errorMsg);
    
    await localClient.query(`
      INSERT INTO sync_log (direction, status, error_msg, finished_at)
      VALUES ('cloud_to_local', 'error', $1, NOW())
    `, [errorMsg]);
    
  } finally {
    localClient.release();
  }
}

// ─── Ejecución principal ───────────────────────────────────────
async function startDaemon() {
  const syncIntervalMinutes = 15;
  const syncIntervalMs = syncIntervalMinutes * 60 * 1000;

  console.log(`\n🚀 Sync Daemon iniciado.`);
  console.log(`   Modo: Background`);
  console.log(`   Intervalo: ${syncIntervalMinutes} minutos\n`);

  // Ejecutar inmediatamente la primera vez
  await runSync();

  // Programar ejecuciones subsecuentes
  setInterval(async () => {
    await runSync();
  }, syncIntervalMs);
}

startDaemon().catch(err => {
  console.error('Fatal error in sync daemon:', err);
  process.exit(1);
});
