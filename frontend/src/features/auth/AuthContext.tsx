import { createContext, useContext, useState, type ReactNode } from 'react';
import { type DemoSession, type DemoUser, USUARIOS_DEMO_PREDEFINIDOS } from './types';

interface AuthContextType {
  session: DemoSession;
  loginDemo: (user?: DemoUser) => void;
  logoutDemo: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESION_INICIAL: DemoSession = {
  isAuthenticated: false,
  user: null,
  ingresoEn: null,
  modoDemo: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<DemoSession>(SESION_INICIAL);

  const loginDemo = (user?: DemoUser) => {
    const selectedUser = user || USUARIOS_DEMO_PREDEFINIDOS[0];
    const timestamp = new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Sesión simulada únicamente en el estado de React (en memoria)
    // No guarda contraseñas, no genera JWT ficticios ni contacta backend
    setSession({
      isAuthenticated: true,
      user: selectedUser,
      ingresoEn: timestamp,
      modoDemo: true,
    });
  };

  const logoutDemo = () => {
    setSession(SESION_INICIAL);
  };

  return (
    <AuthContext.Provider value={{ session, loginDemo, logoutDemo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de un AuthProvider');
  }
  return context;
}
