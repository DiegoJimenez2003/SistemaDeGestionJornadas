import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const SessionContext = createContext();

export const SessionProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);

      if (session?.user) {
        // Traer perfil con rol
        const { data } = await supabase
          .from("perfiles")
          .select("*")
          .eq("user_id", session.user.id)
          .single();

        setUserData(data);
      }

      setLoading(false);
    };

    fetchSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        supabase
          .from("perfiles")
          .select("*")
          .eq("user_id", sess.user.id)
          .single()
          .then(({ data }) => setUserData(data));
      } else {
        setUserData(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, userData, loading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext);
