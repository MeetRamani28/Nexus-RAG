import React, { useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { Nexus3DLogo } from './Nexus3DLogo';

interface AuthPageProps {
  mode?: 'signin' | 'signup';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode: initialMode = 'signup' }) => {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>(initialMode);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // OTP Verification Stage (for Sign Up)
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Clerk Hooks
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  // Helper to extract clean Clerk error messages
  const getErrorMessage = (err: any): string => {
    if (err?.errors?.[0]?.longMessage) return err.errors[0].longMessage;
    if (err?.errors?.[0]?.message) return err.errors[0].message;
    if (err?.message) return err.message;
    return 'An unexpected error occurred. Please try again.';
  };

  // Switch between Sign In and Sign Up tabs
  const handleTabSwitch = (tab: 'signin' | 'signup') => {
    setActiveTab(tab);
    setErrorMsg(null);
    setPendingVerification(false);
  };

  // Social Authentication (Google / GitHub)
  const handleSocialAuth = async (provider: 'oauth_google' | 'oauth_github') => {
    if (!isSignInLoaded || !signIn) return;
    setErrorMsg(null);
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err));
    }
  };

  // Submit Sign In
  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignInLoaded || !signIn) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
      } else {
        setErrorMsg('Additional authentication steps required.');
      }
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Sign Up
  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded || !signUp) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    // Split full name into first and last name
    const parts = fullName.trim().split(' ');
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';

    try {
      await signUp.create({
        emailAddress: email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      // Trigger Email OTP Code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit OTP Verification Code
  const handleOtpVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded || !signUp) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: otpCode.trim(),
      });

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
      } else {
        setErrorMsg('Verification incomplete. Please check your code.');
      }
    } catch (err: any) {
      setErrorMsg(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 h-screen max-h-screen w-full bg-[#000000] text-[#F5F5F7] font-sans flex items-stretch overflow-hidden select-none relative">
      {/* Ambient Glowing Nodes for Glass Refraction */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#E1DCC9]/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="absolute top-1/3 -right-32 w-96 h-96 bg-[#44444E]/30 rounded-full blur-[160px] pointer-events-none z-0" />
      <div className="absolute -bottom-32 left-1/3 w-[500px] h-[500px] bg-[#E1DCC9]/8 rounded-full blur-[180px] pointer-events-none z-0" />
      
      {/* ── LEFT PANEL: Frosted Glass Form Card ───────────── */}
      <div className="w-full lg:w-1/2 h-full flex flex-col justify-between p-4 sm:p-6 lg:p-8 z-10 overflow-y-auto no-scrollbar bg-[#1E1E24]/75 backdrop-blur-2xl border-r border-[#44444E]/40 shadow-2xl">
        
        {/* Top Header Logo with 3D Canvas Icon */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Nexus3DLogo size={34} interactive={false} />
          <span className="text-base font-extrabold text-[#E1DCC9] tracking-tight">
            Nexus-RAG
          </span>
        </div>

        {/* Form Center Content */}
        <div className="my-auto py-2 max-w-sm w-full mx-auto shrink-0">
          
          <AnimatePresence mode="wait">
            {pendingVerification ? (
              /* OTP VERIFICATION VIEW */
              <motion.div
                key="otp-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <div className="w-10 h-10 rounded-xl bg-[#000000] border border-[#44444E] text-[#E1DCC9] flex items-center justify-center mb-2">
                    <KeyRound className="w-5 h-5 text-[#E1DCC9]" />
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-[#F5F5F7]">Check Your Email</h2>
                  <p className="text-xs text-[#9E9EA8] leading-relaxed">
                    We sent a 6-digit code to <span className="text-[#E1DCC9] font-bold">{email}</span>.
                  </p>
                </div>

                {errorMsg && (
                  <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-700/60 p-2.5 rounded-lg text-rose-200 text-xs leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleOtpVerifySubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#F5F5F7] mb-1">Verification Code</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-[#000000] border border-[#44444E] focus:border-[#E1DCC9] rounded-xl px-4 py-2.5 text-center text-lg font-mono tracking-[0.3em] text-[#F5F5F7] placeholder-[#9E9EA8]/50 focus:outline-none focus:ring-1 focus:ring-[#E1DCC9] transition-all shadow-inner"
                    />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isSubmitting || otpCode.length < 6}
                    className="w-full bg-[#E1DCC9] hover:bg-[#EDE8D6] disabled:bg-[#44444E] disabled:text-[#9E9EA8]/50 text-[#1E1E24] font-extrabold py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#1E1E24]" />
                    ) : (
                      <>
                        <span>Verify Email & Access</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => setPendingVerification(false)}
                    className="w-full text-center text-xs text-[#E1DCC9]/80 hover:text-[#E1DCC9] transition-colors pt-1 cursor-pointer font-medium"
                  >
                    ← Back to Sign Up
                  </button>
                </form>
              </motion.div>
            ) : (
              /* MAIN AUTH FORM (Sign Up / Sign In) */
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: activeTab === 'signup' ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: activeTab === 'signup' ? 10 : -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Titles */}
                <div className="space-y-1">
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F5F5F7]">
                    {activeTab === 'signup' ? 'Create Account' : 'Welcome Back'}
                  </h2>
                  <p className="text-xs text-[#9E9EA8] font-medium">
                    {activeTab === 'signup'
                      ? 'Start your research journey today'
                      : 'Sign in to access your intelligent workspace'}
                  </p>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                  <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-700/60 p-2.5 rounded-lg text-rose-200 text-xs leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Form Inputs */}
                <form
                  onSubmit={activeTab === 'signup' ? handleSignUpSubmit : handleSignInSubmit}
                  className="space-y-3"
                >
                  {/* Full Name field (Sign Up only) */}
                  {activeTab === 'signup' && (
                    <div>
                      <label className="block text-xs font-bold text-[#F5F5F7] mb-1">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-[#9E9EA8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Alex Morgan"
                          className="w-full bg-[#000000] border border-[#44444E] focus:border-[#E1DCC9] rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-[#F5F5F7] placeholder-[#9E9EA8]/50 focus:outline-none focus:ring-1 focus:ring-[#E1DCC9] transition-all shadow-inner font-medium"
                        />
                      </div>
                    </div>
                  )}

                  {/* Email Field */}
                  <div>
                    <label className="block text-xs font-bold text-[#F5F5F7] mb-1">Email</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#9E9EA8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@company.com"
                        className="w-full bg-[#000000] border border-[#44444E] focus:border-[#E1DCC9] rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-[#F5F5F7] placeholder-[#9E9EA8]/50 focus:outline-none focus:ring-1 focus:ring-[#E1DCC9] transition-all shadow-inner font-medium"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label className="block text-xs font-bold text-[#F5F5F7] mb-1">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#9E9EA8] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-[#000000] border border-[#44444E] focus:border-[#E1DCC9] rounded-xl pl-10 pr-3 py-2.5 text-xs sm:text-sm text-[#F5F5F7] placeholder-[#9E9EA8]/50 focus:outline-none focus:ring-1 focus:ring-[#E1DCC9] transition-all shadow-inner font-medium"
                      />
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full bg-[#E1DCC9] hover:bg-[#EDE8D6] disabled:bg-[#44444E] disabled:text-[#9E9EA8]/40 text-[#1E1E24] font-extrabold py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-[0_4px_20px_rgba(225,220,201,0.25)] mt-1 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#1E1E24]" />
                    ) : (
                      <span>{activeTab === 'signup' ? 'Register' : 'Sign In'}</span>
                    )}
                  </motion.button>
                </form>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-3">
                  <div className="flex-grow border-t border-[#44444E]/50" />
                  <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-widest text-[#9E9EA8]">
                    {activeTab === 'signup' ? 'OR SIGN UP WITH' : 'OR SIGN IN WITH'}
                  </span>
                  <div className="flex-grow border-t border-[#44444E]/50" />
                </div>

                {/* Social Login Buttons */}
                <div className="grid grid-cols-2 gap-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => handleSocialAuth('oauth_google')}
                    className="flex items-center justify-center gap-2 bg-[#000000]/60 hover:bg-[#1E1E24]/60 border border-[#44444E]/60 hover:border-[#E1DCC9]/70 rounded-xl py-2.5 px-3 text-xs font-bold text-[#F5F5F7] transition-all cursor-pointer shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path
                        fill="#EA4335"
                        d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.2 8.8 5 12 5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.7s.2-2 .4-2.7L1.6 6.4C.6 8.4 0 10.6 0 13s.6 4.6 1.6 6.6l3.7-2.9z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.2 0-5.8-2.2-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z"
                      />
                    </svg>
                    <span>Google</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => handleSocialAuth('oauth_github')}
                    className="flex items-center justify-center gap-2 bg-[#000000]/60 hover:bg-[#1E1E24]/60 border border-[#44444E]/60 hover:border-[#E1DCC9]/70 rounded-xl py-2.5 px-3 text-xs font-bold text-[#F5F5F7] transition-all cursor-pointer shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5 fill-current text-[#F5F5F7]" viewBox="0 0 24 24">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    <span>GitHub</span>
                  </motion.button>
                </div>

                {/* Footer Switch Link */}
                <div className="text-center pt-1">
                  {activeTab === 'signup' ? (
                    <p className="text-xs text-[#9E9EA8] font-medium">
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('signin')}
                        className="text-[#E1DCC9] font-bold hover:underline transition-all cursor-pointer"
                      >
                        Login
                      </button>
                    </p>
                  ) : (
                    <p className="text-xs text-[#9E9EA8] font-medium">
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('signup')}
                        className="text-[#E1DCC9] font-bold hover:underline transition-all cursor-pointer"
                      >
                        Register
                      </button>
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer note */}
        <div className="text-[11px] text-[#9E9EA8] text-center shrink-0 font-medium">
          &copy; {new Date().getFullYear()} Nexus-RAG Intelligence Platform
        </div>
      </div>

      {/* ── RIGHT PANEL: Pure Black Hero Panel ─────────── */}
      <div className="hidden lg:flex w-1/2 h-full relative bg-[#000000] flex-col items-center justify-center p-8 overflow-hidden">
        
        {/* Hero Content Container */}
        <div className="relative z-10 max-w-md text-center space-y-5 flex flex-col items-center">
          
          {/* Floating Boxless 3D Nexus Logo */}
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
            className="relative flex items-center justify-center pointer-events-none"
          >
            <Nexus3DLogo size={160} interactive={true} />
          </motion.div>

          {/* Heading with Cream Linen & Dark Slate Typography */}
          <div className="space-y-2">
            <h1 className="text-3xl xl:text-4xl font-extrabold tracking-tight text-[#F5F5F7] leading-tight">
              Brightening Research With <br />
              <span className="text-[#E1DCC9]">
                Agentic Intelligence
              </span>
            </h1>
            <p className="text-xs text-[#9E9EA8] leading-relaxed max-w-xs mx-auto font-medium">
              Automate your workflow with AI-driven insights, secure data analysis, and advanced research tools.
            </p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-xs pt-2">
            <div className="bg-[#1E1E24]/60 backdrop-blur-xl border border-[#44444E]/50 rounded-2xl p-3.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              <div className="text-xl xl:text-2xl font-black text-[#E1DCC9] tracking-tight">99%</div>
              <div className="text-[9px] font-extrabold uppercase text-[#9E9EA8] tracking-wider mt-0.5">ACCURACY</div>
            </div>

            <div className="bg-[#1E1E24]/60 backdrop-blur-xl border border-[#44444E]/50 rounded-2xl p-3.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              <div className="text-xl xl:text-2xl font-black text-[#E1DCC9] tracking-tight">24/7</div>
              <div className="text-[9px] font-extrabold uppercase text-[#9E9EA8] tracking-wider mt-0.5">RESEARCH</div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AuthPage;
