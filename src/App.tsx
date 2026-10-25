import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import MarketingLayout from './components/MarketingLayout'
import { useAuth } from './contexts/AuthContext'

// Route-level code-splitting: every page loads on demand so the initial
// bundle stays small. The Suspense boundary sits inside each route element,
// so the layout shell (nav) stays mounted while a page chunk loads.
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const ContentList = lazy(() => import('./pages/ContentList'))
const ContentEditor = lazy(() => import('./pages/ContentEditor'))
const Uploads = lazy(() => import('./pages/Uploads'))
const Accounts = lazy(() => import('./pages/Accounts'))
const ProviderWorkspace = lazy(() => import('./pages/ProviderWorkspace'))
const Automations = lazy(() => import('./pages/Automations'))
const AutomationEditor = lazy(() => import('./pages/AutomationEditor'))
const Jobs = lazy(() => import('./pages/Jobs'))
const JobDetail = lazy(() => import('./pages/JobDetail'))
const AIHelper = lazy(() => import('./pages/AIHelper'))
const SocialCompose = lazy(() => import('./pages/SocialCompose'))
const Settings = lazy(() => import('./pages/Settings'))
const SettingsProfile = lazy(() => import('./pages/SettingsProfile'))
const SettingsSecurity = lazy(() => import('./pages/SettingsSecurity'))
const SettingsNotifications = lazy(() => import('./pages/SettingsNotifications'))
const SettingsAiProviders = lazy(() => import('./pages/SettingsAiProviders'))
const NotFound = lazy(() => import('./pages/NotFound'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const Terms = lazy(() => import('./pages/Terms'))

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 md:p-8"><div className="skeleton h-8 w-64 mb-6" /><div className="skeleton h-64" /></div>}>
      {children}
    </Suspense>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Page><Landing /></Page>} />
        <Route path="/login" element={<Page><Login /></Page>} />
        <Route path="/signup" element={<Page><Signup /></Page>} />
      </Route>

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Page><Dashboard /></Page>} />
        <Route path="/content" element={<Page><ContentList /></Page>} />
        <Route path="/content/new" element={<Page><ContentEditor /></Page>} />
        <Route path="/content/:id" element={<Page><ContentEditor /></Page>} />
        <Route path="/uploads" element={<Page><Uploads /></Page>} />
        <Route path="/accounts" element={<Page><Accounts /></Page>} />
        <Route path="/youtube" element={<Page><ProviderWorkspace provider="youtube" /></Page>} />
        <Route path="/tiktok" element={<Page><ProviderWorkspace provider="tiktok" /></Page>} />
        <Route path="/instagram" element={<Page><ProviderWorkspace provider="instagram" /></Page>} />
        <Route path="/facebook" element={<Page><ProviderWorkspace provider="facebook" /></Page>} />
        <Route path="/automations" element={<Page><Automations /></Page>} />
        <Route path="/automations/new" element={<Page><AutomationEditor /></Page>} />
        <Route path="/automations/:id" element={<Page><AutomationEditor /></Page>} />
        <Route path="/jobs" element={<Page><Jobs /></Page>} />
        <Route path="/jobs/:id" element={<Page><JobDetail /></Page>} />
        <Route path="/ai-helper" element={<Page><AIHelper /></Page>} />
        <Route path="/social/compose" element={<Page><SocialCompose /></Page>} />
        <Route path="/settings" element={<Page><Settings /></Page>} />
        <Route path="/settings/profile" element={<Page><SettingsProfile /></Page>} />
        <Route path="/settings/security" element={<Page><SettingsSecurity /></Page>} />
        <Route path="/settings/notifications" element={<Page><SettingsNotifications /></Page>} />
        <Route path="/settings/ai-providers" element={<Page><SettingsAiProviders /></Page>} />
      </Route>

      <Route path="/logout" element={<Logout />} />
      <Route path="/privacy-policy" element={<Page><PrivacyPolicy /></Page>} />
      <Route path="/terms" element={<Page><Terms /></Page>} />
      <Route path="*" element={<Page><NotFound /></Page>} />
    </Routes>
  )
}

function Logout() {
  const { signOut } = useAuth()
  useEffect(() => { signOut() }, [signOut])
  return <Navigate to="/" replace />
}
