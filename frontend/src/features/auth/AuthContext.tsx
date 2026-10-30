import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  loginApi,
  logoutApi,
  refreshApi,
  subscribeSessionExpired,
  subscribeSessionUpdate,
} from './authClient';
import type { AuthSession, User } from './types';

interface AuthContextType {
  session: AuthSession;
  isRestoringSession: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutDemo: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESION_INICIAL: AuthSession = {
  isAuthenticated: false,
  user: null,
  ingresoEn: null,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(SESION_INICIAL);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  // Contador de secuencia para evitar que respuestas obsoletas o StrictMode sobrescriban una sesión más reciente
  const sessionSeqRef = useRef<number>(0);

  // Sincronización automática ante renovaciones silenciosas o expiración desde authenticatedFetch
  useEffect(() => {
    const unsubUpdate = subscribeSessionUpdate((user: User) => {
      setSession((prev) => ({
        ...prev,
        isAuthenticated: true,
        user,
      }));
    });

    const unsubExpired = subscribeSessionExpired(() => {
      setSession(SESION_INICIAL);
    });

    return () => {
      unsubUpdate();
      unsubExpired();
    };
  }, []);

  // Fix 4: Restauración en React protegida contra StrictMode y llamadas duplicadas
  useEffect(() => {
    const currentSeq = ++sessionSeqRef.current;

    async function restoreSession() {
      try {
        const result = await refreshApi();
        if (currentSeq === sessionSeqRef.current) {
          const timestamp = new Date().toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setSession({
            isAuthenticated: true,
            user: result.user,
            ingresoEn: timestamp,
          });
        }
      } catch {
        if (currentSeq === sessionSeqRef.current) {
          setSession(SESION_INICIAL);
        }
      } finally {
        if (currentSeq === sessionSeqRef.current) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreSession();
  }, []);

  const login = async (email: string, password: string) => {
    const result = await loginApi(email, password);
    const timestamp = new Date().toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setSession({
      isAuthenticated: true,
      user: result.user,
      ingresoEn: timestamp,
    });
  };

  // Fix 5: Comprueba el resultado de /auth/logout. Si falla, no limpia la sesión ni oculta el fallo.
  const logout = async () => {
    await logoutApi();
    setSession(SESION_INICIAL);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isRestoringSession,
        login,
        logout,
        logoutDemo: logout,
      }}
    >
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
