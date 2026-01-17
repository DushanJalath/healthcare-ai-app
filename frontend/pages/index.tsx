import Head from 'next/head'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Head>
        <title>Healthcare AI Platform</title>
        <meta name="description" content="AI-powered healthcare document analysis" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Healthcare AI Platform
            </h1>
            <p className="text-xl text-gray-600 mb-4">
              Advanced AI-powered medical document analysis for clinics and patients
            </p>
            <p className="text-gray-500 mb-8">
              New here?{' '}
              <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                Create an account
              </Link>
            </p>
            
            <div className="grid md:grid-cols-2 gap-6 mt-12">
              <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  For Clinics
                </h2>
                <p className="text-gray-600 mb-6">
                  Streamline patient document management and extract valuable insights
                </p>
                <Link 
                  href="/clinic/login"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Clinic Login
                </Link>
              </div>
              
              <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  For Patients
                </h2>
                <p className="text-gray-600 mb-6">
                  Access your medical history and get AI-powered insights
                </p>
                <Link 
                  href="/patient/login"
                  className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Patient Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}