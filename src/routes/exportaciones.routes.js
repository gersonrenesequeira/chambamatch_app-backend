import { Router } from "express";
import {
  exportarExcel,
  exportarCSV,
  exportarPDF,
} from "../controllers/exportaciones.controller.js";

const router = Router();

// GET /api/exportaciones/excel?datos=trabajos|tecnicos|postulaciones|todo
router.get("/excel", exportarExcel);

// GET /api/exportaciones/csv?datos=trabajos|tecnicos|postulaciones
router.get("/csv", exportarCSV);

// GET /api/exportaciones/pdf?datos=trabajos|tecnicos|postulaciones|todo
router.get("/pdf", exportarPDF);

export default router;