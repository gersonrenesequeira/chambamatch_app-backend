import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import usuarioRoutes from './routes/usuarios.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Recrear __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(express.json());

// Servir frontend web de pruebas
app.use(express.static(path.join(__dirname, '../public')));

// Rutas
app.use('/api', usuarioRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en: http://localhost:${PORT}`);
});