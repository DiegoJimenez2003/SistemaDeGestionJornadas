import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Register() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [nombre, setNombre] = useState("");

  const register = async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
    });

    if (error) return alert(error.message);

    // Insertar perfil
    await supabase.from("perfiles").insert({
      user_id: data.user.id,
      nombre,
      vacaciones_disponibles: 15,
      fecha_ingreso: new Date(),
    });

    alert("Usuario creado");
  };

  return (
    <div>
      <h2>Registrar usuario</h2>
      <input placeholder="Nombre" onChange={(e) => setNombre(e.target.value)} />
      <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Contraseña" onChange={(e) => setPass(e.target.value)} />
      <button onClick={register}>Registrar</button>
    </div>
  );
}
