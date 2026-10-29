import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import * as fb from "../config/firebaseAdmin.js";

// Acepta que firebaseAdmin.js exporte `db`, `admin` o `export default admin/db`
const candidato = fb.db ?? fb.admin ?? fb.default;
const db = typeof candidato?.collection === "function" ? candidato : candidato.firestore();

// ==========================================
// CONFIGURACIÓN
// ==========================================
const TZ_OFFSET_MS = -6 * 60 * 60 * 1000; // Nicaragua = UTC-6, sin horario de verano
const DATOS_VALIDOS = ["trabajos", "tecnicos", "postulaciones", "todo"];
const MONEDA = "C$"; // cambia si tu presupuesto no está en córdobas

// ==========================================
// HELPERS
// ==========================================
const pad = (n) => String(n).padStart(2, "0");

const aFecha = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate(); // Timestamp de Firestore
  if (typeof v === "object" && v._seconds !== undefined) return new Date(v._seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const local = (d) => new Date(d.getTime() + TZ_OFFSET_MS); // sus campos UTC = hora de Managua
const fechaCorta = (d) => {
  if (!d) return "—";
  const l = local(d);
  return `${pad(l.getUTCDate())}/${pad(l.getUTCMonth() + 1)}/${l.getUTCFullYear()} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
};
const fechaISO = (d) => {
  if (!d) return "";
  const l = local(d);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
};

const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const sn = (b) => (b === true ? "Sí" : b === false ? "No" : "");
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");
const dinero = (v) =>
  v === null || v === undefined
    ? "—"
    : `${MONEDA} ${Number(v).toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const porFechaDesc = (a, b) => (b.creado_en?.getTime() ?? 0) - (a.creado_en?.getTime() ?? 0);
const sufijo = (datos) => `${datos}-${new Date().toISOString().slice(0, 10)}`;

// ==========================================
// CARGA Y NORMALIZACIÓN DE DATOS
// (nunca se exporta la contraseña de `usuarios`)
// ==========================================
const leer = async (nombre) => (await db.collection(nombre).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

const cargarDatos = async () => {
  const [trabajosRaw, tecnicosRaw, postulacionesRaw, usuariosRaw] = await Promise.all([
    leer("trabajos"),
    leer("tecnicos"),
    leer("postulaciones"),
    leer("usuarios"),
  ]);

  const trabajoPorId = new Map(trabajosRaw.map((t) => [t.id, t]));
  const usuarioPorId = new Map(usuariosRaw.map((u) => [u.id, u]));
  const usuarioPorEmail = new Map(
    usuariosRaw.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u])
  );

  const postPorTrabajo = new Map();
  postulacionesRaw.forEach((p) => {
    if (!p.trabajoID) return;
    if (!postPorTrabajo.has(p.trabajoID)) postPorTrabajo.set(p.trabajoID, []);
    postPorTrabajo.get(p.trabajoID).push(p);
  });

  const trabajos = trabajosRaw
    .map((t) => {
      const posts = postPorTrabajo.get(t.id) || [];
      const fotos = Array.isArray(t.fotosEvidencia) ? t.fotosEvidencia : [];
      return {
        id: t.id,
        titulo: t.titulo ?? "",
        categoria: t.categoria ?? "",
        estado: t.estado ?? "",
        nombre_cliente: t.nombreCliente ?? "",
        presupuesto: num(t.presupuesto),
        ubicacion_departamento: t.ubicacion?.departamento ?? "",
        ubicacion_municipio: t.ubicacion?.municipio ?? "",
        latitud: num(t.coordenadas?.latitude ?? t.coordenadas?._latitude),
        longitud: num(t.coordenadas?.longitude ?? t.coordenadas?._longitude),
        creado_en: aFecha(t.creadoEn),
        total_postulaciones: posts.length,
        postulaciones_activas: posts.filter((p) => String(p.estado || "").toLowerCase() !== "rechazada").length,
        fotos_cantidad: fotos.length,
        fotos_urls: fotos.join(" | "),
        descripcion: t.descripcion ?? "",
        usuario_id: t.usuarioID ?? "",
      };
    })
    .sort(porFechaDesc);

  const tecnicos = tecnicosRaw
    .map((t) => {
      const uid = String(t.usuarioID || "").replace(/^usuarios\//, "");
      const u = usuarioPorId.get(uid) || usuarioPorEmail.get(String(t.usuarioEmail || "").toLowerCase());
      return {
        id: t.id,
        nombre: t.nombre ?? u?.nombre ?? "",
        email: t.usuarioEmail ?? u?.email ?? "",
        telefono: u?.["teléfono"] ?? u?.telefono ?? "",
        oficios: Array.isArray(t.oficios) ? t.oficios.join(", ") : t.categoria ?? "",
        categoria: t.categoria ?? "",
        ubicacion_departamento: cap(t.ubicacion?.departamento ?? t.departamento ?? ""),
        ubicacion_municipio: cap(t.ubicacion?.municipio ?? ""),
        rating: num(t.rating),
        opiniones: num(t.opiniones),
        disponible: sn(t.disponible),
        verificada: sn(t.verificada),
        visible: sn(t.visible),
        latitud: num(t.coordenadas?.latitude ?? t.coordenadas?._latitude),
        longitud: num(t.coordenadas?.longitude ?? t.coordenadas?._longitude),
        ubicacion_actualizada: aFecha(t.coordenadasActualizadas),
        creado_en: aFecha(u?.fechaRegistro), // fecha de registro del usuario
        usuario_id: uid,
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const postulaciones = postulacionesRaw
    .map((p) => {
      const t = trabajoPorId.get(p.trabajoID);
      return {
        id: p.id,
        creado_en: aFecha(p.creadoEn),
        trabajo_id: p.trabajoID ?? "",
        trabajo_titulo: t?.titulo ?? "(trabajo no encontrado)",
        nombre_cliente: t?.nombreCliente ?? "",
        tecnico_nombre: p.tecnicoNombre ?? "",
        telefono: p.telefono ?? "",
        categoria: p.categoria ?? "",
        disponibilidad: p.disponibilidad ?? "",
        estado: p.estado ?? "",
        tecnico_id: p.tecnicoID ?? "",
      };
    })
    .sort(porFechaDesc);

  return { trabajos, tecnicos, postulaciones };
};

// ==========================================
// DEFINICIÓN DE COLUMNAS
// key = nombre de columna en CSV · header = encabezado en Excel
// ==========================================
const COLUMNAS = {
  trabajos: [
    { key: "id", header: "ID", width: 24 },
    { key: "titulo", header: "Título", width: 34, wrap: true },
    { key: "categoria", header: "Categoría", width: 16 },
    { key: "estado", header: "Estado", width: 13 },
    { key: "nombre_cliente", header: "Cliente", width: 22 },
    { key: "presupuesto", header: "Presupuesto", width: 15, tipo: "moneda" },
    { key: "ubicacion_departamento", header: "Departamento", width: 16 },
    { key: "ubicacion_municipio", header: "Municipio", width: 16 },
    { key: "latitud", header: "Latitud", width: 12, tipo: "coord" },
    { key: "longitud", header: "Longitud", width: 12, tipo: "coord" },
    { key: "creado_en", header: "Fecha de creación", width: 19, tipo: "fecha" },
    { key: "total_postulaciones", header: "Postulaciones", width: 14, tipo: "entero" },
    { key: "postulaciones_activas", header: "Postulaciones activas", width: 20, tipo: "entero" },
    { key: "fotos_cantidad", header: "Fotos", width: 8, tipo: "entero" },
    { key: "fotos_urls", header: "Enlaces de fotos", width: 30 },
    { key: "descripcion", header: "Descripción", width: 60, wrap: true },
    { key: "usuario_id", header: "ID del cliente", width: 24 },
  ],
  tecnicos: [
    { key: "id", header: "ID", width: 24 },
    { key: "nombre", header: "Nombre", width: 24 },
    { key: "email", header: "Correo", width: 30 },
    { key: "telefono", header: "Teléfono", width: 15 },
    { key: "oficios", header: "Oficios", width: 32, wrap: true },
    { key: "categoria", header: "Categoría", width: 30, wrap: true },
    { key: "ubicacion_departamento", header: "Departamento", width: 16 },
    { key: "ubicacion_municipio", header: "Municipio", width: 16 },
    { key: "rating", header: "Calificación", width: 12, tipo: "decimal" },
    { key: "opiniones", header: "Opiniones", width: 11, tipo: "entero" },
    { key: "disponible", header: "Disponible", width: 12 },
    { key: "verificada", header: "Verificado", width: 12 },
    { key: "visible", header: "Visible", width: 10 },
    { key: "latitud", header: "Latitud", width: 12, tipo: "coord" },
    { key: "longitud", header: "Longitud", width: 12, tipo: "coord" },
    { key: "ubicacion_actualizada", header: "Ubicación actualizada", width: 21, tipo: "fecha" },
    { key: "creado_en", header: "Fecha de registro", width: 19, tipo: "fecha" },
    { key: "usuario_id", header: "ID de usuario", width: 24 },
  ],
  postulaciones: [
    { key: "id", header: "ID", width: 24 },
    { key: "creado_en", header: "Fecha", width: 19, tipo: "fecha" },
    { key: "trabajo_id", header: "ID del trabajo", width: 24 },
    { key: "trabajo_titulo", header: "Trabajo", width: 34, wrap: true },
    { key: "nombre_cliente", header: "Cliente", width: 22 },
    { key: "tecnico_nombre", header: "Técnico", width: 24 },
    { key: "telefono", header: "Teléfono", width: 15 },
    { key: "categoria", header: "Categoría", width: 18 },
    { key: "disponibilidad", header: "Disponibilidad", width: 16 },
    { key: "estado", header: "Estado", width: 13 },
    { key: "tecnico_id", header: "ID del técnico", width: 24 },
  ],
};

const SECCIONES = {
  trabajos: { hoja: "Trabajos", titulo: "Trabajos publicados", color: "FF4472C4" },
  tecnicos: { hoja: "Técnicos", titulo: "Técnicos registrados", color: "FF70AD47" },
  postulaciones: { hoja: "Postulaciones", titulo: "Postulaciones de técnicos", color: "FFED7D31" },
};

const aListar = (datos) => (datos === "todo" ? ["trabajos", "tecnicos", "postulaciones"] : [datos]);

const parametro = (req, res, { permitirTodo }) => {
  const datos = String(req.query.datos || (permitirTodo ? "todo" : "")).toLowerCase();
  if (!DATOS_VALIDOS.includes(datos)) {
    res.status(400).json({ mensaje: "Parámetro 'datos' inválido. Usa: trabajos, tecnicos, postulaciones o todo." });
    return null;
  }
  if (datos === "todo" && !permitirTodo) {
    res.status(400).json({
      mensaje: "El CSV es un formato plano: elige datos=trabajos, datos=tecnicos o datos=postulaciones.",
    });
    return null;
  }
  return datos;
};

// ==========================================
// EXCEL
// ==========================================
const COLOR_ESTADO = {
  pendiente: "FFFFF2CC",
  en_proceso: "FFDDEBF7",
  completado: "FFE2EFDA",
  aceptada: "FFE2EFDA",
  rechazada: "FFF8CBAD",
};
const relleno = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const borde = { style: "thin", color: { argb: "FFD9D9D9" } };
const bordes = { top: borde, left: borde, bottom: borde, right: borde };

const agregarHoja = (wb, clave, filas) => {
  const { hoja, titulo, color } = SECCIONES[clave];
  const columnas = COLUMNAS[clave];
  const n = columnas.length;
  const ws = wb.addWorksheet(hoja, {
    properties: { tabColor: { argb: color } },
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.mergeCells(1, 1, 1, n);
  const t = ws.getCell(1, 1);
  t.value = `ChambaMatch — ${titulo}`;
  t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  t.fill = relleno(color);
  t.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, n);
  const sub = ws.getCell(2, 1);
  sub.value = `Generado el ${fechaCorta(new Date())}  ·  ${filas.length} registro(s)`;
  sub.font = { italic: true, color: { argb: "FF595959" } };
  sub.alignment = { indent: 1 };

  const head = ws.getRow(4);
  columnas.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = relleno(color);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = bordes;
  });
  head.height = 26;

  filas.forEach((f, idx) => {
    const row = ws.getRow(5 + idx);
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = f[c.key];
      if (c.tipo === "fecha") {
        cell.value = v ? new Date(v.getTime() + TZ_OFFSET_MS) : null; // hora de Managua
        cell.numFmt = "dd/mm/yyyy hh:mm";
      } else {
        cell.value = v === "" || v === undefined ? null : v;
        if (c.tipo === "moneda") cell.numFmt = `"${MONEDA}" #,##0.00`;
        if (c.tipo === "coord") cell.numFmt = "0.000000";
        if (c.tipo === "decimal") cell.numFmt = "0.0";
        if (c.tipo === "entero") cell.numFmt = "0";
      }
      cell.border = bordes;
      cell.alignment = {
        vertical: "top",
        wrapText: c.wrap === true,
        horizontal: ["moneda", "coord", "decimal", "entero"].includes(c.tipo) ? "right" : undefined,
      };
      if (idx % 2 === 1) cell.fill = relleno("FFF7F9FC");
      if (c.key === "estado") {
        const col = COLOR_ESTADO[String(v || "").toLowerCase().replace(/\s+/g, "_")];
        if (col) cell.fill = relleno(col);
        cell.alignment = { vertical: "top", horizontal: "center" };
      }
    });
  });

  columnas.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(filas.length, 1), column: n } };
};

const agregarResumen = (wb, d) => {
  const ws = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: "FF7030A0" } } });
  ws.mergeCells("A1:B1");
  const t = ws.getCell("A1");
  t.value = "ChambaMatch — Resumen";
  t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  t.fill = relleno("FF7030A0");
  t.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  ws.getRow(1).height = 32;
  ws.mergeCells("A2:B2");
  ws.getCell("A2").value = `Generado el ${fechaCorta(new Date())}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF595959" } };
  ws.getCell("A2").alignment = { indent: 1 };

  const cuenta = (arr, estado) => arr.filter((x) => String(x.estado).toLowerCase() === estado).length;
  const filas = [
    ["Trabajos", null],
    ["Total de trabajos", d.trabajos.length],
    ["Pendientes", cuenta(d.trabajos, "pendiente")],
    ["En proceso", cuenta(d.trabajos, "en_proceso")],
    ["Completados", cuenta(d.trabajos, "completado")],
    ["Técnicos", null],
    ["Total de técnicos", d.tecnicos.length],
    ["Disponibles", d.tecnicos.filter((x) => x.disponible === "Sí").length],
    ["Verificados", d.tecnicos.filter((x) => x.verificada === "Sí").length],
    ["Postulaciones", null],
    ["Total de postulaciones", d.postulaciones.length],
    ["Pendientes", cuenta(d.postulaciones, "pendiente")],
    ["Aceptadas", cuenta(d.postulaciones, "aceptada")],
    ["Rechazadas", cuenta(d.postulaciones, "rechazada")],
  ];
  let r = 4;
  filas.forEach(([a, b]) => {
    const row = ws.getRow(r++);
    row.getCell(1).value = a;
    if (b === null) {
      row.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.getCell(1).fill = relleno("FF5B9BD5");
      row.getCell(2).fill = relleno("FF5B9BD5");
    } else {
      row.getCell(2).value = b;
      row.getCell(2).alignment = { horizontal: "right" };
      row.getCell(1).border = bordes;
      row.getCell(2).border = bordes;
    }
  });
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 14;
};

export const exportarExcel = async (req, res) => {
  try {
    const datos = parametro(req, res, { permitirTodo: true });
    if (!datos) return;
    const d = await cargarDatos();

    const wb = new ExcelJS.Workbook();
    wb.creator = "ChambaMatch";
    wb.created = new Date();

    if (datos === "todo") agregarResumen(wb, d);
    aListar(datos).forEach((k) => agregarHoja(wb, k, d[k]));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="chambamatch-${sufijo(datos)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar Excel:", error);
    if (!res.headersSent) res.status(500).json({ mensaje: "Error al generar el Excel.", error: error.message });
  }
};

// ==========================================
// CSV (plano: una colección por archivo, ubicación y coordenadas en columnas separadas)
// ==========================================
export const exportarCSV = async (req, res) => {
  try {
    const datos = parametro(req, res, { permitirTodo: false });
    if (!datos) return;
    const d = await cargarDatos();
    const columnas = COLUMNAS[datos];

    const esc = (v) => {
      if (v === null || v === undefined) return "";
      let s = v instanceof Date ? fechaISO(v) : String(v);
      s = s.replace(/\s*[\r\n]+\s*/g, " "); // mantiene cada registro en una sola línea
      return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lineas = [columnas.map((c) => c.key).join(";")];
    d[datos].forEach((f) => lineas.push(columnas.map((c) => esc(f[c.key])).join(";")));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="chambamatch-${sufijo(datos)}.csv"`);
    res.send("﻿" + lineas.join("\r\n")); // BOM para que Excel respete las tildes
  } catch (error) {
    console.error("Error al generar CSV:", error);
    if (!res.headersSent) res.status(500).json({ mensaje: "Error al generar el CSV.", error: error.message });
  }
};

// ==========================================
// PDF
// ==========================================
const PDF_COLS = {
  trabajos: [
    { header: "Título", key: "titulo", w: 30 },
    { header: "Fecha", key: "creado_en", w: 14, f: (v) => fechaCorta(v) },
    { header: "Cliente", key: "nombre_cliente", w: 18 },
    { header: "Estado", key: "estado", w: 11 },
    { header: "Presupuesto", key: "presupuesto", w: 13, f: (v) => dinero(v) },
    { header: "Ubicación", key: "ubicacion_municipio", w: 18, f: (v, r) => [r.ubicacion_municipio, r.ubicacion_departamento].filter(Boolean).join(", ") || "—" },
    { header: "Postulaciones activas", key: "postulaciones_activas", w: 16, f: (v) => (v > 0 ? `Sí (${v})` : "No") },
  ],
  tecnicos: [
    { header: "Nombre", key: "nombre", w: 22 },
    { header: "Oficios", key: "oficios", w: 28 },
    { header: "Ubicación", key: "ubicacion_municipio", w: 20, f: (v, r) => [r.ubicacion_municipio, r.ubicacion_departamento].filter(Boolean).join(", ") || "—" },
    { header: "Calificación", key: "rating", w: 13, f: (v, r) => (v === null ? "—" : `${v.toFixed(1)} (${r.opiniones ?? 0})`) },
    { header: "Disponible", key: "disponible", w: 10 },
    { header: "Verificado", key: "verificada", w: 10 },
    { header: "Teléfono", key: "telefono", w: 13 },
  ],
  postulaciones: [
    { header: "Fecha", key: "creado_en", w: 14, f: (v) => fechaCorta(v) },
    { header: "Trabajo", key: "trabajo_titulo", w: 30 },
    { header: "Cliente", key: "nombre_cliente", w: 18 },
    { header: "Técnico", key: "tecnico_nombre", w: 20 },
    { header: "Disponibilidad", key: "disponibilidad", w: 14 },
    { header: "Estado", key: "estado", w: 11 },
    { header: "Teléfono", key: "telefono", w: 13 },
  ],
};

export const exportarPDF = async (req, res) => {
  try {
    const datos = parametro(req, res, { permitirTodo: true });
    if (!datos) return;
    const d = await cargarDatos();

    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 40,
      bufferPages: true,
      info: { Title: "Reporte ChambaMatch", Author: "ChambaMatch" },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="chambamatch-${sufijo(datos)}.pdf"`);
    doc.pipe(res);

    const azul = "#4472C4";
    const X = 40;
    const ancho = doc.page.width - 80;
    const limiteY = () => doc.page.height - 60;

    doc.font("Helvetica-Bold").fontSize(20).fillColor(azul).text("Reporte ChambaMatch", X, 40, { align: "center", width: ancho });
    doc.font("Helvetica").fontSize(9).fillColor("#666").text(`Generado el ${fechaCorta(new Date())}`, X, doc.y, { align: "center", width: ancho });
    doc.moveDown(1.2);

    const tabla = (clave) => {
      const filas = d[clave];
      const cols = PDF_COLS[clave];
      const suma = cols.reduce((s, c) => s + c.w, 0);
      const anchos = cols.map((c) => (c.w / suma) * ancho);

      if (doc.y > limiteY() - 60) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(14).fillColor(azul).text(`${SECCIONES[clave].titulo} (${filas.length})`, X, doc.y, { width: ancho });
      doc.moveDown(0.4);

      const encabezado = () => {
        const y = doc.y;
        doc.rect(X, y, ancho, 20).fill(azul);
        let x = X;
        cols.forEach((c, i) => {
          doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9)
            .text(c.header, x + 4, y + 6, { width: anchos[i] - 8, height: 11, ellipsis: true });
          x += anchos[i];
        });
        doc.y = y + 24;
      };
      encabezado();

      if (filas.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor("#666").text("Sin registros.", X, doc.y);
        doc.moveDown(1);
        return;
      }

      filas.forEach((f, idx) => {
        if (doc.y > limiteY()) {
          doc.addPage();
          encabezado();
        }
        const y = doc.y;
        if (idx % 2 === 0) doc.rect(X, y - 2, ancho, 18).fill("#F2F2F2");
        let x = X;
        cols.forEach((c, i) => {
          const v = f[c.key];
          const txt = c.f ? c.f(v, f) : v === null || v === undefined || v === "" ? "—" : String(v);
          doc.fillColor("#333").font("Helvetica").fontSize(8.5)
            .text(txt, x + 4, y + 2, { width: anchos[i] - 8, height: 11, ellipsis: true });
          x += anchos[i];
        });
        doc.y = y + 18;
      });
      doc.moveDown(1.2);
    };

    const anexoTrabajos = () => {
      if (d.trabajos.length === 0) return;
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(14).fillColor(azul).text("Anexo: detalle de trabajos", X, doc.y, { width: ancho });
      doc.moveTo(X, doc.y + 4).lineTo(X + ancho, doc.y + 4).strokeColor(azul).lineWidth(1.2).stroke();
      doc.moveDown(0.8);

      d.trabajos.forEach((t) => {
        const desc = t.descripcion || "Sin descripción.";
        const meta = [
          t.nombre_cliente && `Cliente: ${t.nombre_cliente}`,
          t.categoria && `Categoría: ${t.categoria}`,
          t.estado && `Estado: ${t.estado}`,
          `Presupuesto: ${dinero(t.presupuesto)}`,
          t.creado_en && `Fecha: ${fechaCorta(t.creado_en)}`,
          `Fotos: ${t.fotos_cantidad}`,
        ].filter(Boolean).join("   |   ");

        doc.font("Helvetica").fontSize(9.5);
        const alto = 34 + doc.heightOfString(desc, { width: ancho });
        if (doc.y + alto > limiteY()) doc.addPage();

        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(azul).text(t.titulo || "Sin título", X, doc.y, { width: ancho });
        doc.font("Helvetica").fontSize(8.5).fillColor("#666").text(meta, X, doc.y, { width: ancho });
        doc.font("Helvetica").fontSize(9.5).fillColor("#333").text(desc, X, doc.y + 2, { width: ancho });
        doc.moveDown(0.9);
      });
    };

    aListar(datos).forEach(tabla);
    if (datos === "trabajos" || datos === "todo") anexoTrabajos();

    // Pie de página (se quita el margen inferior para que no cree páginas nuevas)
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#999")
        .text(`Página ${i + 1} de ${rango.count}  |  ChambaMatch`, X, doc.page.height - 28, {
          align: "center",
          width: ancho,
          lineBreak: false,
        });
    }

    doc.end();
  } catch (error) {
    console.error("Error al generar PDF:", error);
    if (!res.headersSent) res.status(500).json({ mensaje: "Error al generar el PDF.", error: error.message });
  }
};