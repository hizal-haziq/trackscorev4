import {useContext} from 'react';
import {AuthContext} from '../app/AuthProvider';
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('Authentication provider is missing.');
  return auth;
}
