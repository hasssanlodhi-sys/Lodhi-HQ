import { AppProvider } from './context/AppContext';
import { useRoute } from './lib/router';
import { Shell } from './components/Shell';
import { TaskModal } from './components/TaskModal';
import { InboxPage } from './pages/InboxPage';
import { CalendarPage } from './pages/CalendarPage';
import { DashboardPage } from './pages/DashboardPage';
import { PerformancePage } from './pages/PerformancePage';
import { TeamPage } from './pages/TeamPage';

export default function App() {
  const route = useRoute();
  return (
    <AppProvider>
      <Shell page={route.page} navigate={route.navigate}>
        {route.page === 'inbox' && <InboxPage route={route} />}
        {route.page === 'calendar' && <CalendarPage />}
        {route.page === 'dashboard' && <DashboardPage route={route} />}
        {route.page === 'performance' && <PerformancePage />}
        {route.page === 'team' && <TeamPage />}
      </Shell>
      <TaskModal />
    </AppProvider>
  );
}
