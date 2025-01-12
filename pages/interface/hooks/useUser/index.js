import webserver from 'infra/webserver';
import { useRouter } from 'next/router';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const userEndpoint = '/api/v1/user';
const sessionEndpoint = '/api/v1/sessions';
const refreshInterval = 600000; // 10 minutes

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(undefined);
  const router = useRouter();

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(userEndpoint);
      const responseBody = await response.json();

      if (response.status !== 401 && response.status !== 403) {
        const fetchedUser = responseBody;

        const cachedUserProperties = {
          id: responseBody.id,
          username: responseBody.username,
          features: responseBody.features,
          tabcoins: responseBody.tabcoins,
          tabcash: responseBody.tabcash,
          cacheTime: Date.now(),
        };

        setUser(fetchedUser);
        localStorage.setItem('user', JSON.stringify(cachedUserProperties));
        localStorage.removeItem('reloadTime');
      } else {
        if (webserver.isProduction && !response.headers.get('x-vercel-id')) {
          // If is proxy response, then go to /login and reload page
          if (localStorage.getItem('reloadTime') > Date.now() - 30000) return;
          if (router.pathname === '/login') {
            localStorage.setItem('reloadTime', Date.now());
            router.reload();
          } else {
            setUser((user) => (user?.id ? { ...user, proxyResponse: true } : null));
            await router.push(`/login?redirect=${router.asPath}`);
          }
          return;
        }

        setUser(null);
        localStorage.removeItem('user');
        const error = new Error(responseBody.message);
        error.status = response.status;
        throw error;
      }
    } catch (error) {
      setError(error);
    }
  }, [router]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    (async () => {
      if (storedUser) {
        setUser(JSON.parse(storedUser));
        await fetchUser();
      }
      setIsLoading(false);
    })();
  }, [fetchUser]);

  useEffect(() => {
    if (isLoading) return;

    function onFocus() {
      const cachedUser = JSON.parse(localStorage.getItem('user'));
      setUser((user) => (cachedUser?.username ? { ...user, ...cachedUser } : null));
      if (refreshInterval < Date.now() - cachedUser?.cacheTime) fetchUser();
    }
    addEventListener('focus', onFocus);

    return () => removeEventListener('focus', onFocus);
  }, [fetchUser, isLoading]);

  const logout = useCallback(async () => {
    try {
      const response = await fetch(sessionEndpoint, {
        method: 'DELETE',
      });

      if (response.status === 200) {
        localStorage.clear();
        setUser(null);
      }
    } catch (error) {
      setError(error);
    }
  }, []);

  const userContextValue = {
    user,
    isLoading,
    error,
    fetchUser,
    logout,
  };

  return <UserContext.Provider value={userContextValue}>{children}</UserContext.Provider>;
}

export default function useUser() {
  return useContext(UserContext);
}
