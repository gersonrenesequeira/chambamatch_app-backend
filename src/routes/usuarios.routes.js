import express from "express";
import multer from "multer";
import {
  registrarUsuario,
  obtenerUsuarios,
  actualizarUsuario,
  eliminarUsuario,
} from "../controllers/usuarios.controller.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Comprobación
router.get("/status", (req, res) => {
  res.json({ mensaje: "Módulo de usuarios activo en ChambaMatch." });
});

// Registrar (acepta foto)
router.post("/usuario", upload.single("foto"), registrarUsuario);
router.post("/usuarios", upload.single("foto"), registrarUsuario);

// Obtener todos
router.get("/usuario", obtenerUsuarios);
router.get("/usuarios", obtenerUsuarios);

// Actualizar
router.put("/usuario/:id", upload.single("foto"), actualizarUsuario);
router.put("/usuarios/:id", upload.single("foto"), actualizarUsuario);

// Eliminar
router.delete("/usuario/:id", eliminarUsuario);
router.delete("/usuarios/:id", eliminarUsuario);

export default router;