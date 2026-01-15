import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { NextAuthOptions } from 'next-auth'
import api from '@/utils/api'

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
          return null
        }

        try {
          const response = await api.post('/auth/login/json', {
            email: credentials.email,
            password: credentials.password
          })

          const { access_token, user } = response.data

          if (access_token && user) {
            return {
              id: user.id.toString(),
              email: user.email,
              name: `${user.first_name} ${user.last_name}`,
              role: user.role,
              accessToken: access_token,
              isActive: user.is_active,
              isVerified: user.is_verified
            }
          }
          return null
        } catch (error) {
          console.error('Authentication error:', error)
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken
        token.role = user.role
        token.isActive = user.isActive
        token.isVerified = user.isVerified
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.user.role = token.role as string
      session.user.isActive = token.isActive as boolean
      session.user.isVerified = token.isVerified as boolean
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 60 // 30 minutes
  },
  secret: process.env.NEXTAUTH_SECRET
}

export default NextAuth(authOptions)