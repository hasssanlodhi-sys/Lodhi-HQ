import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRoute } from './lib/router';
import { Shell } from './components/Shell';
import { TaskModal } from './components/TaskModal';
import { InboxPage } from './pages/InboxPage';
import { CalendarPage } from './pages/CalendarPage';
import { DashboardPage } from './pages/DashboardPage';
import { PerformancePage } from './pages/PerformancePage';
import { TeamPage } from './pages/TeamPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { ChangePasswordPage, SignInPage, Splash } from './pages/SignInPage';

function Gate() {
  const auth = useAuth();
  const route = useRoute();

  if (auth.status === 'loading') return <Splash subtitle="Checking your sign-in…" />;
  if (auth.status === 'setup') {
    return (
      <Splash
        subtitle={auth.message}
        action={
          <a className="text-sm font-medium underline" href="/api/setup.php">
            Open the installer
          </a>
        }
      />
    );
  }
  if (auth.status === 'error') return <Splash subtitle={auth.message} />;
  if (!auth.user) return <SignInPage />;
  if (auth.user.mustChangePassword) return <ChangePasswordPage />;

  return (
    <AppProvider>
      <Shell page={route.page} navigate={route.navigate}>
        {route.page === 'inbox' && <InboxPage route={route} />}
        {route.page === 'calendar' && <CalendarPage />}
        {route.page === 'dashboard' && <DashboardPage route={route} />}
        {route.page === 'performance' && <PerformancePage />}
        {route.page === 'team' && <TeamPage />}
        {route.page === 'integrations' && <IntegrationsPage />}
      </Shell>
      <TaskModal />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
