import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { NextAuthOptions } from 'next-auth'
import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Use environment variable or a fallback for development
// IMPORTANT: In production, always use a strong secret from environment variables
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'healthcare-ai-dev-secret-key-2024-change-in-prod'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter your email and password')
        }

        try {
          // Call backend authentication endpoint
          const response = await axios.post(`${API_BASE_URL}/auth/login/json`, {
            email: credentials.email,
            password: credentials.password
          }, {
            headers: {
              'Content-Type': 'application/json'
            }
          })

          const { access_token, refresh_token, user, token_type } = response.data

          if (access_token && user) {
            return {
              id: user.id.toString(),
              email: user.email,
              name: `${user.first_name} ${user.last_name}`,
              role: user.role,
              accessToken: access_token,
              refreshToken: refresh_token,
              accessTokenExpires: Date.now() + (response.data.expires_in ?? 1800) * 1000,
              isActive: user.is_active,
              isVerified: user.is_verified,
              firstName: user.first_name,
              lastName: user.last_name
            }
          }
          
          throw new Error('Invalid credentials')
        } catch (error: any) {
          console.error('Authentication error:', error.response?.data || error.message)
          
          if (error.response?.status === 401) {
            throw new Error('Incorrect email or password')
          } else if (error.response?.status === 400) {
            throw new Error(error.response.data?.detail || 'Invalid credentials')
          }
          
          throw new Error('Authentication failed. Please try again.')
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in
      if (user) {
        token.accessToken = user.accessToken
        token.refreshToken = user.refreshToken
        token.accessTokenExpires = user.accessTokenExpires
        token.role = user.role
        token.isActive = user.isActive
        token.isVerified = user.isVerified
        token.firstName = user.firstName
        token.lastName = user.lastName
      }

      // Refresh access token if expired (within 1 min buffer)
      if (token.refreshToken && token.accessTokenExpires && Date.now() > token.accessTokenExpires - 60 * 1000) {
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refresh_token: token.refreshToken
          }, { headers: { 'Content-Type': 'application/json' } })
          const { access_token, expires_in } = response.data
          token.accessToken = access_token
          token.accessTokenExpires = Date.now() + (expires_in ?? 1800) * 1000
        } catch (err) {
          // Refresh failed - clear token so user must re-login
          token.accessToken = undefined
          token.refreshToken = undefined
          token.accessTokenExpires = undefined
        }
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client
      session.accessToken = token.accessToken as string
      session.user.role = token.role as string
      session.user.isActive = token.isActive as boolean
      session.user.isVerified = token.isVerified as boolean
      session.user.firstName = token.firstName as string
      session.user.lastName = token.lastName as string
      return session
    }
  },
  pages: {
    signIn: '/',
    error: '/'
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60 // 7 days - persist until refresh token expires or user logs out
  },
  secret: NEXTAUTH_SECRET,
  debug: false // Disable debug logs to reduce noise
}

export default NextAuth(authOptions)