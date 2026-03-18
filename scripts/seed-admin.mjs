/**
 * seed-admin.mjs
 * 
 * Crea el rol "admin" en Firestore con todos los permisos habilitados
 * y lo asigna al usuario cuyo correo pasas como argumento.
 * 
 * Uso:
 *   node scripts/seed-admin.mjs tu@correo.com
 */

import admin from 'firebase-admin';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Inicializar Firebase Admin ──────────────────────────────────────────────
const firebaseDir = join(ROOT, 'firebase');
let serviceAccount;

if (existsSync(firebaseDir)) {
  const files = readdirSync(firebaseDir);
  const jsonFile = files.find(f => f.endsWith('.json'));
  if (jsonFile) {
    serviceAccount = JSON.parse(readFileSync(join(firebaseDir, jsonFile), 'utf8'));
  }
}

if (!serviceAccount) {
  console.error('❌ No se encontró el archivo JSON de credenciales en /firebase/');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db   = admin.firestore();
const auth = admin.auth();

// ── Opciones del menú (deben coincidir con navStructure del frontend) ───────
const ALL_PERMISSIONS = [
  'dashboard',
  'sales_quotes',
  'sales_orders',
  'cash_billing',
  'cash_payments',
  'cash_credits',
  'inv_shipping',
  'inv_void',
  'sec_users',
  'sec_roles',
  'sec_agent',
];

const FULL_CRUD = { read: true, create: true, update: true, delete: true };

const adminPermissions = Object.fromEntries(
  ALL_PERMISSIONS.map(id => [id, FULL_CRUD])
);

// ── Ejecutar ─────────────────────────────────────────────────────────────────
async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('❌ Uso: node scripts/seed-admin.mjs <correo@ejemplo.com>');
    process.exit(1);
  }

  // 1. Crear/actualizar rol admin en colección `permisos`
  console.log('📝 Creando rol "Administrador" en Firestore...');
  await db.collection('permisos').doc('admin').set({
    name: 'Administrador',
    permissions: adminPermissions,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log('✅ Rol "admin" creado/actualizado en permisos/admin');

  // 2. Buscar UID del usuario por email
  console.log(`\n🔍 Buscando usuario con correo: ${email}`);
  let uid;
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    console.log(`✅ Usuario encontrado. UID: ${uid}`);
  } catch (err) {
    console.error(`❌ No se encontró ningún usuario con el correo "${email}" en Firebase Auth.`);
    process.exit(1);
  }

  // 3. Crear/actualizar documento del usuario en colección `usuarios`
  console.log(`\n👤 Asignando rol "admin" al usuario ${uid}...`);
  await db.collection('usuarios').doc(uid).set({
    email,
    is_active: true,
    roles: ['admin'],
    updatedAt: new Date().toISOString()
  }, { merge: true });

  console.log(`✅ Usuario ${email} configurado con rol "admin".`);
  console.log('\n🎉 ¡Seeding completado! Cierra sesión y vuelve a entrar para ver los cambios.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
