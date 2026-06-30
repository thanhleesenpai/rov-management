import { createBrowserRouter, Navigate } from 'react-router-dom'
import NotFoundPage from '@/features/errors/NotFoundPage'
import RouteError from '@/features/errors/RouteError'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import Layout from '@/components/shared/Layout'
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'
import AuthCallback from '@/features/auth/AuthCallback'
import DashboardPage from '@/features/dashboard/DashboardPage'
import RovsPage from '@/features/rovs/RovsPage'
import RovDetailPage from '@/features/rovs/RovDetailPage'
import ProjectsPage from '@/features/projects/ProjectsPage'
import ProjectDetailPage from '@/features/projects/ProjectDetailPage'
import TripsPage from '@/features/trips/TripsPage'
import TripDetailPage from '@/features/trips/TripDetailPage'
import UsersPage from '@/features/users/UsersPage'
import ProfilePage from '@/features/profile/ProfilePage'
import AuditPage from '@/features/audit/AuditPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    path: '/register',
    element: <RegisterPage />
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />
      },
      {
        path: 'dashboard',
        element: <DashboardPage />
      },
      {
        path: 'rovs',
        element: <RovsPage />
      },
      {
        path: 'rovs/:id',
        element: <RovDetailPage />
      },
      {
        path: 'projects',
        element: <ProjectsPage />
      },
      {
        path: 'projects/:id',
        element: <ProjectDetailPage />
      },
      {
        path: 'trips',
        element: <TripsPage />
      },
      {
        path: 'trips/:id',
        element: <TripDetailPage />
      },
      {
        path: 'users',
        element: <UsersPage />
      },
      {
        path: 'profile',
        element: <ProfilePage />
      },
      {
        path: 'audit',
        element: (
          <ProtectedRoute roles={['admin']}>
            <AuditPage />
          </ProtectedRoute>
        )
      }
    ]
  },
  {
    path: '*',
    element: <NotFoundPage />
  }
])

// force vite hmr
