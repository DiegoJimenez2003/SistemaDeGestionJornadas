import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import DuocLogo from "../assets/logoduoc.png";

const isValidDuocEmail = (email) =>
  email.toLowerCase().endsWith("@duocuc.cl"); // Cambia por @duoc.cl si corresponde

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState("");
  const [cargo, setCargo] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("login");
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const hash = window.location.hash;
      
      // 1. Si hay rastro de recuperación en la URL, activamos modo recovery
      // y abortamos cualquier otra lógica de este efecto.
      if (hash.includes("type=recovery") || hash.includes("access_token")) {
        setMode("recovery");
        return; 
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/dashboard");
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Evento detectado:", event);

      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
      } 
      // 2. SOLO navegamos al dashboard si el evento es inicio de sesión 
      // Y NO estamos en modo recuperación.
      else if (event === "SIGNED_IN") {
        // Revisamos la URL un segundo antes de redirigir
        if (!window.location.hash.includes("type=recovery")) {
          navigate("/dashboard");
        } else {
          setMode("recovery");
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);


  /* ===========================
      LOGIN
  ============================ */
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!isValidDuocEmail(email)) return alert("Correo inválido");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return alert(error.message);
    navigate("/dashboard");
  };

  /* ===========================
       REGISTRO
  ============================ */
  const handleRegister = async (e) => {
    e.preventDefault();
    if (!isValidDuocEmail(email)) return alert("Correo inválido");
    if (!email || !password || !nombre || !apellido || !fechaNacimiento || !fechaIngreso || !cargo) {
      return alert("Por favor, completa todos los campos.");
    }
    if (password !== confirmPassword) return alert("Las contraseñas no coinciden.");

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre, apellido, cargo, fecha_nacimiento: fechaNacimiento, fecha_ingreso: fechaIngreso },
      },
    });

    setLoading(false);
    if (authError) return alert("Error: " + authError.message);

    if (data?.user) {
      alert("¡Cuenta creada con éxito!");
      setMode("login");
    }
  };

  /* ===========================
      RECUPERAR (Solicitud)
  ============================ */
  const handleResetPassword = async () => {
    if (!email) return alert("Ingresa tu correo.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`, 
    });
    setLoading(false);

    if (error) return alert(error.message);
    alert("Revisa tu correo, hemos enviado un enlace para restablecer tu clave.");
  };

  /* ===========================
      ACTUALIZAR CLAVE (Final)
  ============================ */
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (password.length < 6) return alert("La contraseña debe tener al menos 6 caracteres");
    if (password !== confirmPassword) return alert("Las contraseñas no coinciden.");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) return alert(error.message);
    alert("¡Contraseña actualizada!");
    setMode("login");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-[#37788a] to-[#6ec5ac] px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col items-center p-8 sm:p-10">
        <img src={DuocLogo} alt="Duoc Logo" className="h-20 w-auto mb-6 object-contain select-none" />

        <h1 className="text-3xl sm:text-4xl font-extrabold mb-2 text-[#37788a] text-center">
          {mode === "recovery" ? "Nueva Contraseña" : mode === "login" ? "¡Bienvenido!" : "Crea tu cuenta"}
        </h1>

        <p className="text-gray-600 mb-6 text-center">
          {mode === "recovery" 
            ? "Escribe tu nueva clave para " 
            : mode === "login" 
            ? "Ingresa al sistema de gestión de tareas de " 
            : "Regístrate en el sistema de gestión de tareas de "}
          <span className="font-semibold text-[#6ec5ac]">App Duoc</span>
        </p>

        <form 
          className="w-full flex flex-col gap-4" 
          onSubmit={mode === "recovery" ? handleUpdatePassword : (mode === "login" ? handleLogin : handleRegister)}
        >
          {mode === "recovery" ? (
            <>
              <input type="password" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
              <input type="password" placeholder="Confirmar nueva contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" required />
            </>
          ) : (
            <>
              {mode === "register" && (
                <>
                  <input type="text" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="input" required />
                  <input type="text" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} className="input" required />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="flex flex-col">
                      <label className="mb-1 font-medium text-gray-700">Fecha de Nacimiento</label>
                      <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="w-full p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#4b4b54]" required />
                    </div>
                    <div className="flex flex-col">
                      <label className="mb-1 font-medium text-gray-700">Fecha de Ingreso</label>
                      <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className="w-full p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-[#4b4b54]" required />
                    </div>
                  </div>
                  <input type="text" placeholder="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} className="input" required />
                </>
              )}

              <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} className="input" required />
              <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="input" required />
              
              {mode === "register" && (
                <input type="password" placeholder="Confirmar contraseña" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" required />
              )}
            </>
          )}

          <button type="submit" disabled={loading} className="w-full py-3 bg-[#6ec5ac] hover:bg-[#5bb499] text-white font-bold rounded-lg mt-2 transition">
            {loading ? "Procesando..." : mode === "recovery" ? "Actualizar Contraseña" : mode === "login" ? "Iniciar sesión" : "Registrarse"}
          </button>
        </form>

        <div className="mt-4 flex justify-between w-full text-sm">
          {mode === "recovery" ? (
             <button onClick={() => setMode("login")} className="text-[#37788a] font-semibold hover:underline w-full text-center">Cancelar</button>
          ) : mode === "login" ? (
            <>
              <button onClick={handleResetPassword} className="text-[#37788a] font-semibold hover:underline">¿Olvidaste tu contraseña?</button>
              <button onClick={() => setMode("register")} className="text-[#6ec5ac] font-semibold hover:underline">Crea tu cuenta</button>
            </>
          ) : (
            <button onClick={() => setMode("login")} className="text-[#37788a] font-semibold hover:underline">Volver al login</button>
          )}
        </div>
      </div>
    </div>
  );
}