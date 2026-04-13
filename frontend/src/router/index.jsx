import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import Layout from '@/components/shared/Layout'
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'
import DashboardPage from '@/features/dashboard/DashboardPage'
import RovsPage from '@/features/rovs/RovsPage'
import RovDetailPage from '@/features/rovs/RovDetailPage'
import TripsPage from '@/features/trips/TripsPage'
import TripDetailPage from '@/features/trips/TripDetailPage'
import JobsPage from '@/features/jobs/JobsPage'
import UsersPage from '@/features/users/UsersPage'
import ProfilePage from '@/features/profile/ProfilePage'

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
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
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
        path: 'trips',
        element: <TripsPage />
      },
      {
        path: 'trips/:id',
        element: <TripDetailPage />
      },
      {
        path: 'jobs',
        element: <JobsPage />
      },
      {
        path: 'users',
        element: <UsersPage />
      },
      {
        path: 'profile',
        element: <ProfilePage />
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />
  }
])
