import { GetServerSideProps } from 'next'
import { getSession } from 'next-auth/react'
import Head from 'next/head'
import RegisterForm from '@/components/auth/RegisterForm'
import { Toaster } from 'react-hot-toast'

export default function RegisterPage() {
  return (
    <>
      <Head>
        <title>Register - MediKeep</title>
        <meta name="description" content="Create account on MediKeep platform" />
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
        destination: '/',
        permanent: false,
      },
    }
  }

  return {
    props: {},
  }
}