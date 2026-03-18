/**
 * Script de Inicialización de BD_Master (Firebase Firestore)
 * 
 * Este script crea las colecciones principales (usuarios, permisos),
 * inserta los roles por defecto y crea un usuario ROOT.
 * 
 * Ejecución: npx tsx scripts/init-firebase-db.ts
 */

// @ts-nocheck
const admin = require('firebase-admin');
const dotenv = require('dotenv');

const fs = require('fs');
const path = require('path');

// Encontrar el archivo JSON en la carpeta firebase
const firebaseDir = path.join(__dirname, '..', 'firebase');
const files = fs.readdirSync(firebaseDir);
const jsonFile = files.find(f => f.endsWith('.json'));

if (!jsonFile) {
  console.error("❌ ERROR: No se encontró ningún archivo .json en la carpeta /firebase/");
  process.exit(1);
}

try {
  // Configurar inicialización directa desde el archivo
  const serviceAccountPath = path.join(firebaseDir, jsonFile);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("✅ Firebase Admin Inicializado via JSON Local");
} catch (error) {
  console.error("❌ ERROR al inicializar Firebase Admin:", error);
  process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

const MasterCollections = {
  USERS: 'usuarios',
  PERMISSIONS: 'permisos',
  CONNECTIONS: 'conexiones',
  TENANTS: 'tenants'
};

async function createSuperAdminRole() {
  console.log("⏳ Creando rol SuperAdmin en DRBAC...");
  const roleRef = db.collection(MasterCollections.PERMISSIONS).doc('rol_superadmin');
  
  await roleRef.set({
    name: 'Super Administrador',
    description: 'Acceso total y absoluto al sistema Multi-Tenant',
    permissions: [
      'gestionar_usuarios', 
      'facturar', 
      'consultar_stock', 
      'gestionar_empresa',
      'ver_reportes',
      'gestionar_conexiones'
    ],
    created_at: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log("✅ Rol 'rol_superadmin' creado.");
}

async function createRootUser() {
  const rootEmail = 'admin@sync2k.com';
  const rootPassword = 'SuperSecretPassword2026!'; // ⚠️ CÁMBIALO AL INGRESAR
  let uid = '';

  console.log(`⏳ Buscando/Creando usuario Auth para ${rootEmail}...`);
  try {
    const userRecord = await auth.getUserByEmail(rootEmail);
    uid = userRecord.uid;
    // Forzamos actualización de contraseña por si acaso cambió
    await auth.updateUser(uid, { password: rootPassword });
    console.log(`✅ Usuario Auth encontrado y actualizado (UID: ${uid})`);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email: rootEmail,
        password: rootPassword,
        displayName: 'Sync2k Root Admin',
        emailVerified: true
      });
      uid = newUser.uid;
      console.log(`✅ Usuario Auth CREADO (UID: ${uid}) - Pass: ${rootPassword}`);
    } else {
      throw error;
    }
  }

  console.log(`⏳ Creando perfil maestro en Firestore para UID: ${uid}...`);
  const userRef = db.collection(MasterCollections.USERS).doc(uid);
  
  await userRef.set({
    full_name: 'Sync2k Root Admin',
    email: rootEmail,
    is_active: true,
    roles: ['rol_superadmin'], // Asignamos el rol creado en la función anterior
    created_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true }); // Merge ignora si ya existía y solo actualiza

  console.log("✅ Perfil Firestore creado con éxito.");
}

async function runMigration() {
  try {
    console.log("🚀 Iniciando migración de BD_Master...");
    await createSuperAdminRole();
    await createRootUser();
    console.log("🎉 Migración completada exitosamente.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Fallo crítico en migración:", error);
    process.exit(1);
  }
}

// Ejecutar
runMigration();
