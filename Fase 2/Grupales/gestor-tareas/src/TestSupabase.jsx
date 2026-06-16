import { supabase } from "./lib/supabaseClient";

export default function TestSupabase() {
  async function test() {
    const { data, error } = await supabase.from("test").select("*");
    console.log(data, error);
  }

  test();

  return <h1>Probando conexión...</h1>;
}
