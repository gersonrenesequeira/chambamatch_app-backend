import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual de forma segura en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Construir la ruta absoluta exacta hacia serviceAccountKey.json en la raíz del proyecto
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

let serviceAccount = null;

try {
  if (!existsSync(serviceAccountPath)) {
    console.error(`❌ No se encontró el archivo serviceAccountKey.json en: ${serviceAccountPath}`);
  } else {
    const fileContent = readFileSync(serviceAccountPath, 'utf8');
    serviceAccount = JSON.parse(fileContent);
  }
} catch (error) {
  console.error('❌ Error al leer o parsear el archivo serviceAccountKey.json:', error.message);
}

if (!admin.apps.length && serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log('✓ Firebase Admin inicializado correctamente.');
}

const db = admin.firestore();

export { db };