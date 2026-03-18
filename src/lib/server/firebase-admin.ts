// src/lib/server/firebase-admin.ts
import admin from 'firebase-admin';
import { FIREBASE_SERVICE_ACCOUNT_KEY } from '$env/static/private';
import fs from 'fs';
import path from 'path';

if (!admin.apps.length) {
  try {
    let serviceAccount: any;

    // Estrategia 1: Intentar leer desde el archivo físico (Ideal para local)
    const localKeyPath = path.resolve(process.cwd(), 'firebase');
    console.log(`🔍 Checking for Firebase JSON in: ${localKeyPath}`);
    
    if (fs.existsSync(localKeyPath)) {
      const files = fs.readdirSync(localKeyPath);
      const jsonFile = files.find(f => f.endsWith('.json'));
      if (jsonFile) {
        const fullPath = path.join(localKeyPath, jsonFile);
        console.log(`📂 Found local JSON: ${fullPath}`);
        serviceAccount = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      }
    }

    // Estrategia 2: Fallback a la variable de entorno (Para Vercel/Producción)
    if (!serviceAccount && FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.log('☁️ Loading Firebase Admin from Environment Variable');
      let rawKey = FIREBASE_SERVICE_ACCOUNT_KEY;
      if (rawKey.startsWith("'") && rawKey.endsWith("'")) rawKey = rawKey.slice(1, -1);
      
      try {
        serviceAccount = JSON.parse(rawKey);
      } catch (e) {
        serviceAccount = JSON.parse(rawKey.replace(/\\n/g, '\n'));
      }
      
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin Initialized successfully.');
    } else {
      console.error('❌ No Firebase credentials found (no JSON file and no env var).');
    }
  } catch (error: any) {
    console.error('❌ Error initializing Firebase Admin:', error.message);
  }
}

export const adminAuth = admin.apps.length ? admin.auth() : null;
export const adminDb = admin.apps.length ? admin.firestore() : null;

// Multi-Tenant Helpers for the Master DB
export const MasterCollections = {
  USERS: 'usuarios',
  PERMISSIONS: 'permisos',
  CONNECTIONS: 'conexiones',
  SUBSCRIPTIONS: 'suscripciones',
  USER_TENANTS: 'roles_usuarios',
  AUDIT: 'auditoria'
};
