import NextAuth, { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    accessToken?: string
    user: {
      id: string
      role: string
      isActive: boolean
      isVerified: boolean
      firstName?: string
      lastName?: string
      clinicId?: number | null
      clinicLicenseNumber?: string | null
      clinicName?: string | null
    } & DefaultSession['user']
  }

  interface User {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role: string
    isActive: boolean
    isVerified: boolean
    firstName?: string
    lastName?: string
    clinicId?: number | null
    clinicLicenseNumber?: string | null
    clinicName?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    role?: string
    isActive?: boolean
    isVerified?: boolean
    firstName?: string
    lastName?: string
    clinicId?: number | null
    clinicLicenseNumber?: string | null
    clinicName?: string | null
  }
}