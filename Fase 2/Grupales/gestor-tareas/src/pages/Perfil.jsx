import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../Providers/SessionProvider";
import AlloyLogo from "../assets/User.png";
import { useNavigate } from "react-router-dom";
import { CameraIcon, LogOut, Calendar } from "lucide-react"; 
import confetti from "canvas-confetti";

export default function Perfil() {
  const { userData } = useSession();
  const [avatarUrl, setAvatarUrl] = useState(userData?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [esCumpleaños, setEsCumpleaños] = useState(false);
  const navigate = useNavigate();

  // DETECTAR CUMPLEAÑOS
  useEffect(() => {
    if (userData?.fecha_nacimiento) {
      const hoy = new Date();
      const fechaNac = new Date(userData.fecha_nacimiento);
      
      const esHoy = hoy.getUTCDate() === fechaNac.getUTCDate() && 
                    hoy.getUTCMonth() === fechaNac.getUTCMonth();

      if (esHoy) {
        setEsCumpleaños(true);
        lanzarChallas();
      }
    }
  }, [userData]);

  const lanzarChallas = () => {
    const duracion = 4 * 1000;
    const final = Date.now() + duracion;

    const intervalo = setInterval(() => {
      if (Date.now() > final) return clearInterval(intervalo);

      confetti({
        particleCount: 40,
        startVelocity: 30,
        spread: 360,
        origin: { x: Math.random(), y: Math.random() - 0.2 },
        colors: ['#37788a', '#6ec5ac', '#ffd700']
      });
    }, 250);
  };

  if (!userData) return (
    <div className="flex h-screen items-center justify-center">
      <div className="animate-pulse text-[#37788a] font-medium">Cargando perfil...</div>
    </div>
  );

  const uploadAvatar = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setUploading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("No hay sesión activa");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}.${fileExt}`; 
      const filePath = fileName; 

      const { error: uploadError } = await supabase.storage
        .from("avatars") 
        .upload(filePath, file, { upsert: true }); 

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("perfiles")
        .update({ avatar_url: data.publicUrl })
        .eq("user_id", user.id); 

      if (updateError) throw updateError;

      setAvatarUrl(data.publicUrl);
      alert("¡Foto actualizada con éxito!");

    } catch (error) {
      console.error("Error detallado:", error);
      alert(`Error: ${error.message || "No tienes permisos para editar este perfil"}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 py-12 px-4 flex justify-center items-start pt-10 sm:pt-20">
      <div className="bg-white/80 backdrop-blur-md p-8 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-2xl border border-white">
        
        {/* MENSAJE DE CUMPLEAÑOS */}
        {esCumpleaños && (
          <div className="mb-8 p-4 bg-gradient-to-r from-[#6ec5ac]/20 to-[#37788a]/20 rounded-2xl border border-[#6ec5ac]/30 animate-pulse text-center">
            <h3 className="text-[#37788a] font-black text-xl uppercase tracking-tighter">✨ ¡Feliz Cumpleaños, {userData.nombre}! ✨</h3>
            <p className="text-slate-600 text-sm font-medium">Todo el equipo de Alloy te desea un día increíble 🎂</p>
          </div>
        )}

        {/* CABECERA / AVATAR */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative group">
            {/* Foto estática con anillo verde suave solo si es cumple */}
            <div className={`h-32 w-32 sm:h-40 sm:w-40 rounded-full overflow-hidden border-4 border-white shadow-xl transition-transform duration-300 group-hover:scale-105 ${uploading ? 'opacity-50' : ''} ${esCumpleaños ? 'ring-4 ring-[#6ec5ac] ring-offset-2' : ''}`}>
              <img
                src={avatarUrl || AlloyLogo}
                alt="Avatar"
                className="h-full w-full object-cover"
              />
            </div>
            
            <label 
              htmlFor="avatar-upload" 
              className="absolute bottom-2 right-2 bg-[#37788a] hover:bg-[#2c616f] text-white p-3 rounded-full shadow-lg cursor-pointer transition-all transform hover:rotate-90 flex items-center justify-center"
            >
              <span className="text-xl font-bold leading-none">+</span>
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={uploadAvatar}
                disabled={uploading}
                className="hidden"
              />
            </label>
            
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/20 rounded-full">
                <div className="w-8 h-8 border-4 border-[#37788a] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          <h2 className="text-4xl font-extrabold mt-6 text-slate-800 tracking-tight text-center">
            <span>{userData.nombre} {userData.apellido}</span>
          </h2>
          <span className="mt-2 px-4 py-1 bg-[#37788a]/10 text-[#37788a] rounded-full text-sm font-semibold tracking-wide uppercase">
            {userData.cargo || "Colaborador"}
          </span>
        </div>

        {/* INFO GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <div className={`bg-white p-5 rounded-2xl shadow-sm border flex flex-col items-center text-center transition-all ${esCumpleaños ? 'border-[#6ec5ac] scale-105' : 'border-slate-100'}`}>
            <p className="text-slate-400 text-xs uppercase font-bold mb-1">Cumpleaños</p>
            <p className="text-slate-800 font-medium">{userData.fecha_nacimiento || "—"}</p>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <p className="text-slate-400 text-xs uppercase font-bold mb-1">Vacaciones</p>
            <p className="text-[#37788a] font-bold text-xl">{userData.vacaciones_disponibles || 0} <span className="text-sm font-normal text-slate-500">días</span></p>
          </div>
        </div>

        {/* ACCIONES */}
        <div className="space-y-4">
          <button
            onClick={() => navigate("/Solicitudes")}
            className="w-full py-4 bg-[#6ec5ac] hover:bg-[#5bb499] text-white font-bold rounded-2xl shadow-lg shadow-[#6ec5ac]/30 transition-all active:scale-[0.98]"
          >
            Gestionar Solicitudes
          </button>
          
          <button
            onClick={async () => await supabase.auth.signOut()}
            className="w-full py-3 bg-transparent hover:bg-red-50 text-red-400 font-medium rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            Cerrar Sesión
          </button>
        </div>
        
      </div>
    </div>
  );
}