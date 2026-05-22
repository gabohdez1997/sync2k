import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz de profit-web
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.LOCAL_PG_URL;
if (!connectionString) {
    console.error('ERROR: LOCAL_PG_URL no está definido en el archivo .env');
    process.exit(1);
}

const pool = new pg.Pool({
    connectionString
});

async function migrate() {
    try {
        console.log('Conectando a PostgreSQL local...');
        const client = await pool.connect();
        console.log('Conexión exitosa. Leyendo archivo SQL...');
        
        const sqlPath = path.join(__dirname, '../supabase/migrations/009_update_permissions_matrix.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Aplicando migración 009 en base de datos local...');
        await client.query(sql);
        console.log('¡Migración 009 aplicada localmente con éxito!');
        
        client.release();
    } catch (err) {
        console.error('Error aplicando migración local:', err);
    } finally {
        await pool.end();
    }
}

migrate();
