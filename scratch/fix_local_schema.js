import { queryLocalDb } from '../src/lib/server/local-db.js';

async function fixLocalSchema() {
    try {
        console.log("--- 1. Ensuring theme_config column in profiles table ---");
        await queryLocalDb(`
            ALTER TABLE profiles 
            ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT NULL;
        `);

        console.log("--- 2. Updating profile_complete view ---");
        // We drop and recreate it to be absolutely sure it has the theme_config column
        await queryLocalDb(`DROP VIEW IF EXISTS profile_complete;`);
        
        // Re-creating the view definition (same as in 005_fix_theming_and_settings.sql)
        await queryLocalDb(\`
            CREATE VIEW profile_complete AS
            SELECT
            p.id,
            p.full_name,
            p.email,
            p.active,
            p.profit_user,
            p.profit_pass,
            p.theme_config,
            p.updated_at,
            NULL as synced_at, -- placeholder

            get_merged_permissions(p.id) AS permissions,

            COALESCE(
                (
                SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = p.id
                ),
                '[]'::jsonb
            ) AS roles,

            COALESCE(
                (
                SELECT jsonb_agg(DISTINCT jsonb_build_object(
                    'id',                  b.id,
                    'name',                b.name,
                    'agent_url',           b.agent_url,
                    'agent_token',         b.agent_token,
                    'profit_branch_codes', b.profit_branch_codes,
                    'sql_config',          b.sql_config,
                    'profit_server_id',    b.profit_server_id,
                    'local_dns_alias',     b.local_dns_alias
                ))
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                JOIN branches b ON (
                    (r.branch_ids IS NULL OR cardinality(r.branch_ids) = 0)
                    OR b.id = ANY(r.branch_ids)
                )
                WHERE ur.user_id = p.id AND b.active = true
                ),
                '[]'::jsonb
            ) AS allowed_branches,

            COALESCE(
                (
                SELECT array_agg(DISTINCT wid ORDER BY wid)
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                CROSS JOIN LATERAL unnest(r.warehouse_ids) AS wid
                WHERE ur.user_id = p.id
                ),
                '{}'::text[]
            ) AS allowed_warehouses

            FROM profiles p;
        \`);

        console.log("SUCCESS: Local schema fixed and profile_complete view updated.");
    } catch (e) {
        console.error("FIX SCHEMA ERROR:", e);
    }
    process.exit(0);
}

fixLocalSchema();
