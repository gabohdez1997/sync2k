// verify-db.mjs — Verificación del schema local
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost', port: 5432,
  user: 'postgres', password: 'Galpe2021*',
  database: 'sync2k'
});

async function verify() {
  const client = await pool.connect();
  try {
    console.log('\n═══ Verificación PostgreSQL local (sync2k) ═══\n');

    // Tablas
    const { rows: tables } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
    );
    console.log('📋 Tablas:', tables.map(r => r.tablename).join(', '));

    // Vistas
    const { rows: views } = await client.query(
      `SELECT viewname FROM pg_views WHERE schemaname='public'`
    );
    console.log('👁️  Vistas:', views.length > 0 ? views.map(r => r.viewname).join(', ') : 'ninguna todavía');

    // Funciones
    const { rows: funcs } = await client.query(
      `SELECT proname FROM pg_proc WHERE proname IN ('get_merged_permissions','log_action','update_updated_at')`
    );
    console.log('⚙️  Funciones:', funcs.map(r => r.proname).join(', '));

    // Roles
    const { rows: roles } = await client.query(`SELECT id, name FROM roles`);
    console.log('\n🎭 Roles creados:');
    roles.forEach(r => console.log(`   ✓ ${r.name} (${r.id})`));

    // Sucursales
    const { rows: branches } = await client.query(`SELECT id, name, profit_branch_code, profit_server_id FROM branches`);
    console.log('\n🏢 Sucursales:');
    branches.forEach(b => console.log(`   ✓ ${b.name} | co_sucu: ${b.profit_branch_code} | server: ${b.profit_server_id}`));

    // Test de la vista profile_complete (vacía)
    const { rows: profiles } = await client.query(`SELECT id, email FROM profile_complete`);
    console.log('\n✅ Vista profile_complete funciona correctamente');
    console.log(`   Usuarios activos: ${profiles.length}`);

    console.log('\n═══ Todo listo en PostgreSQL local ═══');
    console.log('\n📌 Próximo paso: Ejecutar el mismo SQL en Supabase');
    console.log('   URL: https://supabase.com/dashboard/project/rxtxzlzmxsjzicjuwbra/sql/new');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();
