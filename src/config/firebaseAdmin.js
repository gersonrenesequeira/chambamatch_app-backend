import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount = null;

// 1. Intentar cargar desde Variable de Entorno (Ideal para Render)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('Error al parsear FIREBASE_SERVICE_ACCOUNT de .env:', e.message);
  }
} 

// 2. Si no hay variable de entorno, intentar leer el archivo local
if (!serviceAccount) {
  const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
  if (existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  }
}

if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✓ Firebase Admin autenticado correctamente.');
} else if (!serviceAccount) {
  console.error('❌ NO SE ENCONTRARON CREDENCIALES DE FIREBASE ADMIN.');
}

const db = admin.firestore();

export { db };