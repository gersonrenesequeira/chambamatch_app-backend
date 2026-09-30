import { db } from "../config/firebaseAdmin.js";
import supabase from "../config/supabase.js";

const BUCKET_NAME = "imagen_usuariosCHAMBAMACHA";

// Obtener todos los usuarios
export const obtenerUsuarios = async (req, res) => {
  try {
    const snapshot = await db.collection("usuarios").get();

    const usuarios = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(usuarios);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({
      mensaje: "Error al obtener los usuarios.",
      error: error.message,
    });
  }
};

// Eliminar usuario y su imagen de Supabase
export const eliminarUsuario = async (req, res) => {
  try {
    const { id } = req.params;

    const docRef = db.collection("usuarios").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        mensaje: "Usuario no encontrado.",
      });
    }

    // Eliminar la foto de perfil de Supabase si existe
    const fotoUrl = doc.data().fotoUrl;
    if (fotoUrl) {
      try {
        const ruta = fotoUrl.split(`/${BUCKET_NAME}/`)[1];
        if (ruta) {
          await supabase.storage.from(BUCKET_NAME).remove([ruta]);
        }
      } catch (err) {
        console.error("No se pudo eliminar la imagen de Supabase:", err.message);
      }
    }

    // Eliminar el documento de Firestore
    await docRef.delete();

    res.status(200).json({
      mensaje: `Usuario eliminado con éxito. ID: ${id}`,
    });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({
      mensaje: "Error al eliminar el usuario.",
      error: error.message,
    });
  }
};

// Registrar usuario
export const registrarUsuario = async (req, res) => {
  try {
    const { nombre, correo, telefono, rol, especialidad } = req.body || {};
    const imagen = req.file;

    if (!nombre || !correo || !telefono || !rol) {
      return res.status(400).json({
        mensaje: "Campos obligatorios: nombre, correo, telefono y rol.",
      });
    }

    if (!imagen) {
      return res.status(400).json({
        mensaje: "La foto de perfil del usuario es obligatoria.",
      });
    }

    if (!imagen.mimetype.startsWith("image/")) {
      return res.status(400).json({
        mensaje: "El archivo subido debe ser una imagen válida.",
      });
    }

    const extension = imagen.originalname.split(".").pop().toLowerCase();
    const nombreArchivo = `usuario-${Date.now()}-${Math.random().toString(36).substring(2)}.${extension}`;
    const rutaImagen = `usuarios/${nombreArchivo}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(rutaImagen, imagen.buffer, {
        contentType: imagen.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error al subir imagen:", uploadError);
      return res.status(500).json({
        mensaje: "Error al subir la imagen a Supabase.",
        error: uploadError.message,
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(rutaImagen);

    const fotoUrl = publicUrlData.publicUrl;

    const docRef = await db.collection("usuarios").add({
      nombre,
      correo,
      telefono,
      rol, // 'cliente' o 'tecnico'
      especialidad: especialidad || "N/A",
      fotoUrl,
      fechaRegistro: new Date().toISOString(),
    });

    res.status(201).json({
      mensaje: `¡Usuario registrado con éxito! ID: ${docRef.id}`,
      id: docRef.id,
      fotoUrl,
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    res.status(500).json({
      mensaje: "Error al registrar el usuario.",
      error: error.message,
    });
  }
};

// Actualizar usuario
export const actualizarUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, correo, telefono, rol, especialidad } = req.body || {};
    const imagen = req.file || (Array.isArray(req.files) ? req.files[0] : req.files);

    if (!nombre || !correo || !telefono || !rol) {
      return res.status(400).json({
        mensaje: "Campos obligatorios: nombre, correo, telefono y rol.",
      });
    }

    const docRef = db.collection("usuarios").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        mensaje: "Usuario no encontrado.",
      });
    }

    const fotoAntiguaUrl = doc.data().fotoUrl;
    let fotoUrl = fotoAntiguaUrl;

    // Si viene una imagen nueva
    if (imagen) {
      if (!imagen.mimetype.startsWith("image/")) {
        return res.status(400).json({
          mensaje: "El archivo debe ser una imagen.",
        });
      }

      // 1. Subir la NUEVA imagen a Supabase
      const extension = imagen.originalname.split(".").pop().toLowerCase();
      const nombreArchivo = `usuario-${Date.now()}-${Math.random().toString(36).substring(2)}.${extension}`;
      const rutaImagen = `usuarios/${nombreArchivo}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(rutaImagen, imagen.buffer, {
          contentType: imagen.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error al subir imagen nueva:", uploadError);
        return res.status(500).json({
          mensaje: "Error al subir la imagen a Supabase.",
          error: uploadError.message,
        });
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(rutaImagen);

      fotoUrl = publicUrlData.publicUrl;

      // 2. ELIMINAR LA IMAGEN VIEJA DEL BUCKET SI EXISTÍA
      if (fotoAntiguaUrl) {
        try {
          const rutaAntigua = fotoAntiguaUrl.split(`/${BUCKET_NAME}/`)[1];
          if (rutaAntigua) {
            await supabase.storage.from(BUCKET_NAME).remove([rutaAntigua]);
            console.log("✓ Imagen anterior eliminada con éxito de Supabase:", rutaAntigua);
          }
        } catch (err) {
          console.error("No se pudo eliminar la imagen anterior de Supabase:", err.message);
        }
      }
    }

    // 3. Actualizar los datos en Firestore
    await docRef.update({
      nombre,
      correo,
      telefono,
      rol,
      especialidad: especialidad || "N/A",
      fotoUrl,
    });

    res.status(200).json({
      mensaje: `¡Usuario actualizado con éxito! ID: ${id}`,
      fotoUrl,
    });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({
      mensaje: "Error al actualizar el usuario.",
      error: error.message,
    });
  }
};