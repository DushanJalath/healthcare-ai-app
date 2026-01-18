import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <>
      <Head>
        <title>MediKeep - Intelligent Chronic Care Platform</title>
        <meta name="description" content="Unified health record management for chronic care patients and clinics" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <main className="min-h-screen bg-gradient-to-br from-medical-50 via-white to-tech-50">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto">
            {/* Logo/Brand */}
            <div className="mb-8">
              <div className="flex items-center justify-center mb-4">
                <Image
                  src="/medikeep.png"
                  alt="MediKeep Logo"
                  width={120}
                  height={120}
                  className="object-contain"
                  priority
                />
              </div>
              <h1 className="text-4xl font-bold mb-2">
                <span className="bg-gradient-to-r from-medical-600 to-medical-700 bg-clip-text text-transparent">
                  MediKeep
                </span>
            </h1>
              <p className="text-lg text-gray-600 font-medium">
                Intelligent Chronic Care Platform
              </p>
            </div>
            
            <p className="text-xl text-gray-700 mb-4 leading-relaxed">
              Tracking, Predicting and Personalizing care
            </p>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              Secure platform that unifies scattered medical data and helps patients get personalized, proactive care with intelligent insights and emergency support.
            </p>
            
            <p className="text-gray-600 mb-8">
              New here?{' '}
              <Link href="/register" className="text-medical-600 hover:text-medical-700 font-semibold transition-colors">
                Create an account
              </Link>
            </p>
            
            <div className="grid md:grid-cols-2 gap-8 mt-12">
              <div className="bg-white p-8 rounded-xl shadow-md border border-medical-100 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-medical-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-medical-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  For Clinics
                </h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Streamline patient document management with easy access to medical records, insights, and patient management tools.
                </p>
                <Link 
                  href="/clinic/login"
                  className="inline-block bg-medical-600 text-white px-6 py-3 rounded-lg hover:bg-medical-700 transition-colors font-medium"
                >
                  Clinic Login
                </Link>
              </div>
              
              <div className="bg-white p-8 rounded-xl shadow-md border border-tech-100 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 bg-tech-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-tech-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  For Patients
                </h2>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Secure storage and full ownership of your medical records. Access your complete health history with personalized insights.
                </p>
                <Link 
                  href="/patient/login"
                  className="inline-block bg-tech-600 text-white px-6 py-3 rounded-lg hover:bg-tech-700 transition-colors font-medium"
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