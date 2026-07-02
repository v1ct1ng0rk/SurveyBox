import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

type AuthRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _skipAuthRefresh?: boolean
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

const AUTH_SKIP_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

function shouldSkipAuthRefresh(url?: string, config?: AuthRequestConfig) {
  if (config?._skipAuthRefresh) return true
  if (!url) return false
  return AUTH_SKIP_REFRESH_PATHS.some((path) => url.includes(path))
}

function redirectToLogin() {
  localStorage.removeItem('access_token')
  const path = window.location.pathname
  if (!path.startsWith('/login') && !path.startsWith('/f/')) {
    window.location.replace('/login')
  }
}

let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = api
      .post<{ access_token: string }>('/auth/refresh', null, { _skipAuthRefresh: true } as AuthRequestConfig)
      .then(({ data }) => {
        localStorage.setItem('access_token', data.access_token)
        return data.access_token
      })
      .catch((err) => {
        redirectToLogin()
        throw err
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AuthRequestConfig | undefined
    if (!original || error.response?.status !== 401) {
      return Promise.reject(error)
    }

    if (shouldSkipAuthRefresh(original.url, original)) {
      if (original.url?.includes('/auth/refresh')) {
        redirectToLogin()
      }
      return Promise.reject(error)
    }

    if (original._retry) {
      redirectToLogin()
      return Promise.reject(error)
    }

    original._retry = true
    try {
      const token = await refreshAccessToken()
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch {
      return Promise.reject(error)
    }
  },
)

export default api
