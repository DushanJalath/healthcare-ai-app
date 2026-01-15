import NextAuth, { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    user: {
      id: string
      role: string
      isActive: boolean
      isVerified: boolean
    } & DefaultSession['user']
  }

  interface User {
    accessToken?: string
    role: string
    isActive: boolean
    isVerified: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    role?: string
    isActive?: boolean
    isVerified?: boolean
  }
}