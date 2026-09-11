import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import MarketingLayout from './components/MarketingLayout'

import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import ContentList from './pages/ContentList'
import ContentEditor from './pages/ContentEditor'
import Uploads from './pages/Uploads'
import Accounts from './pages/Accounts'
import ProviderWorkspace from './pages/ProviderWorkspace'
import Automations from './pages/Automations'
import AutomationEditor from './pages/AutomationEditor'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import AIHelper from './pages/AIHelper'
import SocialCompose from './pages/SocialCompose'
import Settings from './pages/Settings'
import SettingsProfile from './pages/SettingsProfile'
import SettingsSecurity from './pages/SettingsSecurity'
import SettingsNotifications from './pages/SettingsNotifications'
import SettingsAiProviders from './pages/SettingsAiProviders'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/content" element={<ContentList />} />
        <Route path="/content/new" element={<ContentEditor />} />
        <Route path="/content/:id" element={<ContentEditor />} />
        <Route path="/uploads" element={<Uploads />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/youtube" element={<ProviderWorkspace provider="youtube" />} />
        <Route path="/tiktok" element={<ProviderWorkspace provider="tiktok" />} />
        <Route path="/instagram" element={<ProviderWorkspace provider="instagram" />} />
        <Route path="/facebook" element={<ProviderWorkspace provider="facebook" />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/automations/new" element={<AutomationEditor />} />
        <Route path="/automations/:id" element={<AutomationEditor />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/ai-helper" element={<AIHelper />} />
        <Route path="/social/compose" element={<SocialCompose />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/profile" element={<SettingsProfile />} />
        <Route path="/settings/security" element={<SettingsSecurity />} />
        <Route path="/settings/notifications" element={<SettingsNotifications />} />
        <Route path="/settings/ai-providers" element={<SettingsAiProviders />} />
      </Route>

      <Route path="/logout" element={<Logout />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

import { useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
function Logout() {
  const { signOut } = useAuth()
  useEffect(() => { signOut() }, [signOut])
  return <Navigate to="/" replace />
}
