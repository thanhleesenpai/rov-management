import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),

      setAccessToken: (accessToken) => set({ accessToken }),

      updateUser: (updates) =>
        set((state) => ({ user: { ...state.user, ...updates } })),

      logout: () => set({ user: null, accessToken: null, refreshToken: null })
    }),
    {
      name: 'rov-auth',
      // Chỉ persist user và refreshToken, không persist accessToken
      partialize: (state) => ({
        user: state.user,
        refreshToken: state.refreshToken
      })
    }
  )
)
