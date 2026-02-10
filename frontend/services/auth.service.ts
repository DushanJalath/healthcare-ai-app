import api from '@/utils/api'
import { LoginRequest, RegisterRequest, AuthResponse, User } from '@/types'

class AuthService {
  /**
   * Login user with email and password
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login/json', credentials)
    
    // Store tokens and user in localStorage
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token)
      localStorage.setItem('refresh_token', response.data.refresh_token || '')
      localStorage.setItem('user', JSON.stringify(response.data.user))
    }
    
    return response.data
  }

  /**
   * Register a new user
   */
  async register(userData: RegisterRequest): Promise<User> {
    const response = await api.post<User>('/auth/register', userData)
    return response.data
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me')
    return response.data
  }

  /**
   * Logout user
   */
  logout(): void {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    window.location.href = '/'
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token')
  }

  /**
   * Get stored user data
   */
  getStoredUser(): User | null {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        return JSON.parse(userStr)
      } catch (error) {
        return null
      }
    }
    return null
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem('access_token')
  }

  /**
   * Get stored refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token')
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return false
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        }
      )
      if (!response.ok) return false
      const data = await response.json()
      if (data.access_token) {
        localStorage.setItem('access_token', data.access_token)
        return true
      }
      return false
    } catch {
      return false
    }
  }
}

export default new AuthService()
