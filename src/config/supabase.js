import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Faltan las credenciales de Supabase en el archivo .env (SUPABASE_URL y SUPABASE_KEY).");
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;