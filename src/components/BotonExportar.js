// Componente React Native (Expo): botón "Implementar" que despliega los formatos.
// Instalar: npx expo install expo-file-system expo-sharing
import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// IP de tu PC en la red local (o la URL del backend desplegado)
const API_URL = "http://192.168.1.10:3000";

const FORMATOS = [
  { id: "excel", etiqueta: "Excel (.xlsx)", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { id: "pdf", etiqueta: "PDF (.pdf)", ext: "pdf", mime: "application/pdf" },
  { id: "csv", etiqueta: "CSV (.csv)", ext: "csv", mime: "text/csv" },
];

export default function BotonExportar({ datos = "todo" }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(null);

  const descargar = async (f) => {
    try {
      setCargando(f.id);
      const nombre = `chambamatch-${datos}-${new Date().toISOString().slice(0, 10)}.${f.ext}`;
      const destino = FileSystem.documentDirectory + nombre;
      const res = await FileSystem.downloadAsync(`${API_URL}/api/exportar/${f.id}?datos=${datos}`, destino);
      if (res.status !== 200) throw new Error(`Error del servidor (${res.status})`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri, { mimeType: f.mime, dialogTitle: "Guardar archivo" });
      } else {
        Alert.alert("Archivo guardado", res.uri);
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setCargando(null);
    }
  };

  return (
    <View style={s.contenedor}>
      <TouchableOpacity style={s.boton} onPress={() => setAbierto(!abierto)}>
        <Text style={s.textoBoton}>Implementar {abierto ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {abierto && (
        <View style={s.menu}>
          {FORMATOS.map((f) => (
            <TouchableOpacity key={f.id} style={s.opcion} onPress={() => descargar(f)} disabled={!!cargando}>
              <Text style={s.textoOpcion}>{f.etiqueta}</Text>
              {cargando === f.id && <ActivityIndicator size="small" />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  contenedor: { margin: 16 },
  boton: { backgroundColor: "#4472C4", padding: 14, borderRadius: 10, alignItems: "center" },
  textoBoton: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  menu: { marginTop: 8, backgroundColor: "#fff", borderRadius: 10, elevation: 3, overflow: "hidden" },
  opcion: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  textoOpcion: { fontSize: 15, color: "#333" },
});