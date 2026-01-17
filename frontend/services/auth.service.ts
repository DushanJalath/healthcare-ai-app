import api from '@/utils/api'
import { LoginRequest, RegisterRequest, AuthResponse, User } from '@/types'

class AuthService {
  /**
   * Login user with email and password
   */
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login/json', credentials)
    
    // Store the access token in localStorage
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token)
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
}

export default new AuthService()
