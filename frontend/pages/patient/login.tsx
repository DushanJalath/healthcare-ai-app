import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import Head from 'next/head'
import LoginForm from '@/components/auth/LoginForm'
import { Toaster } from 'react-hot-toast'

export default function PatientLoginPage() {
  return (
    <>
      <Head>
        <title>Patient Login - Healthcare AI</title>
        <meta name="description" content="Login to Healthcare AI platform for patients" />
      </Head>
      <LoginForm userType="patient" />
      <Toaster position="top-right" />
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context)

  if (session) {
    return {
      redirect: {
        destination: '/patients/dashboard',
        permanent: false,
      },
    }
  }

  return {
    props: {},
  }
}
