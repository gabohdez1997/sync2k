#!/usr/bin/env node
// scripts/create-admin.mjs
// Crea el primer usuario administrador en:
//   1. Supabase Auth (pre-verificado, sin email de confirmación)
//   2. Supabase Cloud PostgreSQL (tabla profiles + user_roles)
//   3. PostgreSQL local (tabla profiles + user_roles — para modo offline)
//
// Uso: node scripts/create-admin.mjs <email> <password> <"Nombre Completo"> [profit_user] [profit_pass]
// Ej:  node scripts/create-admin.mjs admin@galpe.com MiPass123 "Administrador Galpe" ADM ""

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

// ─── Argumentos de línea de comandos ───────────────────────────
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('');
  console.error('❌ Uso: node scripts/create-admin.mjs <email> <password> <"Nombre Completo"> [profit_user] [profit_pass]');
  console.error('   Ej:  node scripts/create-admin.mjs admin@galpe.com MiPass123 "Admin Galpe" ADM ""');
  console.error('');
  process.exit(1);
}

const [email, password, fullName, profitUser = '', profitPass = ''] = args;

// ─── Configuración ─────────────────────────────────────────────
const SUPABASE_URL         = 'https://rxtxzlzmxsjzicjuwbra.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4dHh6bHpteHNqemljanV3YnJhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUwNTMxMywiZXhwIjoyMDkxMDgxMzEzfQ.1ACftlsKcl4-NOEnNojlUr1fktpIWnMzeS2YjE2ajTM';

const LOCAL_POOL = new Pool({
  host: 'localhost', port: 5432,
  user: 'postgres', password: 'Galpe2021*',
  database: 'sync2k'
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// ─── Main ───────────────────────────────────────────────────────
async function main() {
  console.log('\n═══ Sync2K — Crear Usuario Administrador ══════════════');
  console.log(`   Email:  ${email}`);
  console.log(`   Nombre: ${fullName}`);
  if (profitUser) console.log(`   Profit: ${profitUser}`);
  console.log('');

  // 1. Obtener el rol Administrador desde Supabase Cloud
  const { data: adminRole, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', 'Administrador')
    .single();

  if (roleError || !adminRole) {
    console.error('❌ No se encontró el rol "Administrador" en Supabase.');
    console.error('   Ejecuta 001_init_schema.sql en el SQL Editor de Supabase primero.');
    process.exit(1);
  }
  console.log(`✅ Rol Administrador en Cloud: ${adminRole.id}`);

  // 2. Crear usuario en Supabase Auth (pre-verificado, sin confirmación de email)
  let authUserId;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });

  if (authError) {
    if (authError.message.toLowerCase().includes('already') || authError.status === 422) {
      // Usuario ya existe — recuperar su UUID
      const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) { console.error('❌ No se pudo listar usuarios:', listErr.message); process.exit(1); }
      const existing = users.find(u => u.email === email);
      if (!existing) { console.error('❌ Usuario existe pero no se pudo recuperar.'); process.exit(1); }
      authUserId = existing.id;
      console.log(`⚠️  Usuario ya existía en Supabase Auth — reutilizando UUID: ${authUserId}`);
    } else {
      console.error('❌ Error creando usuario en Supabase Auth:', authError.message);
      process.exit(1);
    }
  } else {
    authUserId = authData.user.id;
    console.log(`✅ Usuario creado en Supabase Auth: ${authUserId}`);
  }

  // 3. Hash de contraseña bcrypt para modo offline local
  console.log('   Generando bcrypt hash (esto tarda ~1s)...');
  const passwordHash = await bcrypt.hash(password, 12);
  console.log('✅ Password hash generado');

  // 4. Insertar perfil en Supabase Cloud
  const { error: profileCloudErr } = await supabase
    .from('profiles')
    .upsert({
      id:            authUserId,
      full_name:     fullName,
      email:         email,
      password_hash: passwordHash,
      profit_user:   profitUser || null,
      profit_pass:   profitPass || null,
      active:        true
    }, { onConflict: 'id' });

  if (profileCloudErr) {
    console.error('❌ Error en Supabase profiles:', profileCloudErr.message);
    process.exit(1);
  }
  console.log('✅ Perfil insertado en Supabase Cloud');

  // 5. Asignar rol Administrador en Supabase Cloud
  const { error: roleCloudErr } = await supabase
    .from('user_roles')
    .upsert({ user_id: authUserId, role_id: adminRole.id }, { onConflict: 'user_id,role_id' });

  if (roleCloudErr) {
    console.error('❌ Error asignando rol en Supabase Cloud:', roleCloudErr.message);
    process.exit(1);
  }
  console.log('✅ Rol Administrador asignado en Supabase Cloud');

  // 6. Replicar perfil y rol en PostgreSQL local
  const localClient = await LOCAL_POOL.connect();
  try {
    await localClient.query('BEGIN');

    // Obtener UUID del rol Administrador local
    const { rows: localRoles } = await localClient.query(
      `SELECT id FROM roles WHERE name = 'Administrador' LIMIT 1`
    );
    if (!localRoles.length) throw new Error('Rol Administrador no encontrado en PostgreSQL local');

    // Insertar/actualizar perfil local con el MISMO UUID de Supabase Auth
    await localClient.query(`
      INSERT INTO profiles (id, full_name, email, password_hash, profit_user, profit_pass, active, synced_at)
      VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
      ON CONFLICT (id) DO UPDATE SET
        full_name     = EXCLUDED.full_name,
        email         = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        profit_user   = EXCLUDED.profit_user,
        profit_pass   = EXCLUDED.profit_pass,
        active        = true,
        synced_at     = NOW(),
        updated_at    = NOW()
    `, [authUserId, fullName, email, passwordHash,
        profitUser || null, profitPass || null]);

    // Asignar rol Administrador local
    await localClient.query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `, [authUserId, localRoles[0].id]);

    await localClient.query('COMMIT');
    console.log('✅ Perfil y rol replicados en PostgreSQL local');

  } catch (err) {
    await localClient.query('ROLLBACK');
    console.error('❌ Error en PostgreSQL local:', err.message);
    process.exit(1);
  } finally {
    localClient.release();
  }

  // 7. Verificar con profile_complete
  const { rows } = await LOCAL_POOL.query(
    `SELECT
       id, email, full_name, active,
       jsonb_array_length(roles) AS num_roles,
       (SELECT count(*) FROM jsonb_object_keys(permissions)) AS num_perms
     FROM profile_complete WHERE id = $1`,
    [authUserId]
  );

  const v = rows[0];
  console.log('\n─── Verificación final (profile_complete) ───────────────');
  console.log(`   UUID:      ${v.id}`);
  console.log(`   Email:     ${v.email}`);
  console.log(`   Nombre:    ${v.full_name}`);
  console.log(`   Activo:    ${v.active}`);
  console.log(`   Roles:     ${v.num_roles}`);
  console.log(`   Módulos:   ${v.num_perms} permisos configurados`);

  await LOCAL_POOL.end();

  console.log('\n✅ ══ Usuario administrador creado exitosamente ══════════');
  console.log(`\n   Email:      ${email}`);
  console.log(`   Contraseña: (la que ingresaste)`);
  console.log(`\n   Online:  http://localhost:5173 (o tu dominio en Vercel)`);
  console.log(`   Offline: http://profit.galpe.local:5173`);
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message);
  LOCAL_POOL.end().catch(() => {});
  process.exit(1);
});
