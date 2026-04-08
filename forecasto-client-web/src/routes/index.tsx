import { createBrowserRouter, Navigate } from 'react-router-dom'
import { MainLayout } from '@/components/layout/MainLayout'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { CashflowPage } from '@/pages/CashflowPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SupportPage } from '@/pages/SupportPage'
import { SkillsPage } from '@/pages/SkillsPage'
import { InboxPage } from '@/pages/InboxPage'
import { UsagePage } from '@/pages/UsagePage'
import { AdminLayout, AdminDashboard, RegistrationCodesPage, UsersPage, ActivatedCodesReportPage, BillingSummaryPage, BillingProfilesPage, BillingProfileDetailPage, UserDetailPage } from '@/pages/admin'
import { MobileLayout } from '@/pages/mobile/MobileLayout'
import { MobileQuickEntry } from '@/pages/mobile/MobileQuickEntry'
import { useAuthStore } from '@/stores/authStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

export const router = createBrowserRouter([
  {
    path: '/support',
    element: <SupportPage />,
  },
  {
    path: '/skill',
    element: <SkillsPage />,
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <PublicRoute>
        <RegisterPage />
      </PublicRoute>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicRoute>
        <ForgotPasswordPage />
      </PublicRoute>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'cashflow', element: <CashflowPage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'usage', element: <UsagePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: 'codes', element: <RegistrationCodesPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/:userId', element: <UserDetailPage /> },
      { path: 'billing-profiles', element: <BillingProfilesPage /> },
      { path: 'billing-profiles/:profileId', element: <BillingProfileDetailPage /> },
      { path: 'reports/activations', element: <ActivatedCodesReportPage /> },
      { path: 'reports/billing', element: <BillingSummaryPage /> },
    ],
  },
  {
    path: '/mobile',
    element: (
      <ProtectedRoute>
        <MobileLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <MobileQuickEntry /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
