import {AuthProvider} from './AuthProvider';
import {ManagerRoute} from './routes';
import {ManagerDashboard} from '../pages/manager/ManagerDashboard';

export default function App() {
  return <AuthProvider><ManagerRoute><ManagerDashboard /></ManagerRoute></AuthProvider>;
}
