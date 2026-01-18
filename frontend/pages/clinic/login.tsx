import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import Head from 'next/head'
import LoginForm from '@/components/auth/LoginForm'
import { Toaster } from 'react-hot-toast'

export default function ClinicLoginPage() {
  return (
    <>
      <Head>
        <title>Clinic Login - MediKeep</title>
        <meta name="description" content="Login to MediKeep platform for clinics" />
      </Head>
      <LoginForm userType="clinic" />
      <Toaster position="top-right" />
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context)

  if (session) {
    return {
      redirect: {
        destination: '/clinic/dashboard',
        permanent: false,
      },
    }
  }

  return {
    props: {},
  }
}
