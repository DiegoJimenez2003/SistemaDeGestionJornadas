import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import DuocLogo from "../assets/logoduoc.png";
import { useSession } from "../Providers/SessionProvider";
import { supabase } from "../lib/supabaseClient";

export default function Header() {
  const [open, setOpen] = useState(false);
  const { session, userData } = useSession();
  const navigate = useNavigate();

  if (!session) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  // Componente interno para evitar repetir código de enlaces
  const NavLinks = ({ mobile = false }) => {
    const closeMenu = () => mobile && setOpen(false);
    const linkClass = mobile
      ? "text-gray-700 hover:text-[#37788a] transition py-2 border-b border-gray-50"
      : "text-gray-700 hover:text-[#37788a] transition";

    return (
      <>
        <Link to="/dashboard" onClick={closeMenu} className={linkClass}>
          Registro de Tareas
        </Link>
        <Link to="/mytasks" onClick={closeMenu} className={linkClass}>
          Mis Tareas
        </Link>
        <Link to="/seguimiento" onClick={closeMenu} className={linkClass}>
          Seguimiento
        </Link>

        {/* Gestión PM (Para Admin y PM) */}
        {(userData?.rol === "admin" || userData?.rol === "pm") && (
          <Link to="/PMPanel" onClick={closeMenu} className={linkClass}>
            Gestión PM
          </Link>
        )}

        {/* Opciones exclusivas de Admin */}
        {userData?.rol === "admin" && (
          <>
            <Link to="/admin" onClick={closeMenu} className={linkClass}>
              Admin
            </Link>
            <Link to="/graficos" onClick={closeMenu} className={linkClass}>
              Dashboard
            </Link>
          </>
        )}
      </>
    );
  };

  return (
    <header className="shadow-md px-6 py-3 sticky top-0 z-40 bg-white">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* LOGO */}
        <div className="flex items-center gap-3">
          <img
            src={AlloyLogo}
            alt="Alloy Logo"
            className="h-12 w-auto object-contain select-none"
          />
        </div>

        {/* MENÚ DESKTOP */}
        <nav className="hidden md:flex items-center gap-6 text-sm lg:text-base font-medium">
          <NavLinks />
        </nav>

        {/* USUARIO / PERFIL DESKTOP */}
        <div className="hidden md:flex items-center gap-4 font-medium text-gray-700">
          <span className="text-sm">Hola, {userData?.nombre}</span>
          <Link
            to="/perfil"
            className="px-4 py-2 rounded-lg bg-[#6ec5ac] text-white text-sm font-semibold hover:bg-[#5bb499] transition"
          >
            Perfil
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-[#37788a] text-white text-sm font-semibold hover:bg-[#2f6170] transition"
          >
            Cerrar sesión
          </button>
        </div>

        {/* BOTÓN MENÚ MÓVIL */}
        <button
          className="md:hidden text-gray-700 p-2"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* MENÚ MÓVIL */}
      {open && (
        <nav className="md:hidden mt-3 pb-6 flex flex-col gap-2 text-lg font-medium border-t pt-4">
          <div className="flex flex-col gap-2 mb-4">
            <NavLinks mobile />
          </div>
          
          <div className="flex flex-col gap-3 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500 italic">Usuario: {userData?.nombre}</span>
            <Link 
              to="/perfil" 
              onClick={() => setOpen(false)} 
              className="text-[#6ec5ac] font-bold text-center py-2 border border-[#6ec5ac] rounded-lg"
            >
              Ver Perfil
            </Link>
            <button 
              onClick={handleLogout} 
              className="text-white bg-[#37788a] font-bold py-2 rounded-lg shadow-sm"
            >
              Cerrar sesión
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}