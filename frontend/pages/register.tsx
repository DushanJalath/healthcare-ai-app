import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import Head from 'next/head'
import RegisterForm from '@/components/auth/RegisterForm'
import { Toaster } from 'react-hot-toast'

export default function RegisterPage() {
  return (
    <>
      <Head>
        <title>Register - Healthcare AI</title>
        <meta name="description" content="Create account on Healthcare AI platform" />
      </Head>
      <RegisterForm />
      <Toaster position="top-right" />
    </>
  )
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getSession(context)

  if (session) {
    return {
      redirect: {
        destination: '/dashboard',
        permanent: false,
      },
    }
  }

  return {
    props: {},
  }
}