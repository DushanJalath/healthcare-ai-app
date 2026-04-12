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
            },
            timeout: 15_000
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
              lastName: user.last_name,
              clinicId: user.clinic_id ?? null,
              clinicLicenseNumber: user.clinic_license_number ?? null,
              clinicName: user.clinic_name ?? null
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
    async jwt({ token, user, trigger, session }) {
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
        token.clinicId = user.clinicId
        token.clinicLicenseNumber = user.clinicLicenseNumber
        token.clinicName = user.clinicName
      }

      // After clinic profile update (or other client `update()` calls)
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as Record<string, unknown>
        if ('clinicLicenseNumber' in s) {
          token.clinicLicenseNumber = s.clinicLicenseNumber as string | null | undefined
        }
        if ('clinicName' in s) {
          token.clinicName = s.clinicName as string | null | undefined
        }
      }

      // Refresh access token if expired (within 1 min buffer)
      if (token.refreshToken && token.accessTokenExpires && Date.now() > token.accessTokenExpires - 60 * 1000) {
        try {
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            { refresh_token: token.refreshToken },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10_000 }
          )
          const { access_token, expires_in } = response.data
          if (!access_token) {
            throw new Error('No access_token in refresh response')
          }
          token.accessToken = access_token
          token.accessTokenExpires = Date.now() + (expires_in ?? 1800) * 1000
          delete token.error
        } catch {
          token.accessToken = undefined
          token.refreshToken = undefined
          token.accessTokenExpires = undefined
          token.error = 'RefreshAccessTokenError'
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.error) {
        session.error = token.error as string
      } else {
        delete session.error
      }
      // Send properties to the client
      session.accessToken = token.accessToken as string | undefined
      session.user.role = token.role as string
      session.user.isActive = token.isActive as boolean
      session.user.isVerified = token.isVerified as boolean
      session.user.firstName = token.firstName as string
      session.user.lastName = token.lastName as string
      session.user.clinicId = token.clinicId as number | null | undefined
      session.user.clinicLicenseNumber = token.clinicLicenseNumber as string | null | undefined
      session.user.clinicName = token.clinicName as string | null | undefined
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