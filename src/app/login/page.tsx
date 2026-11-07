'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { createClient } from '@/lib/supabase/client';
import {
  GraduationCap,
  Briefcase,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

function LoginFormContent() {
  const { setCurrentUser } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL query parameters for OAuth errors and tab defaults
  const urlError = searchParams.get('error');
  const unauthorizedEmail = searchParams.get('unauthorized_email');
  const tabParam = searchParams.get('tab') || searchParams.get('role');

  // Active tab state for mobile view ('student' | 'faculty')
  const [activeTab, setActiveTab] = useState<'student' | 'faculty'>(
    tabParam === 'faculty' || tabParam === 'mentor' ? 'faculty' : 'student'
  );

  // Student Google Auth states
  const [googleEmailInput, setGoogleEmailInput] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Faculty Password Auth states
  const [facultyEmail, setFacultyEmail] = useState('');
  const [facultyPassword, setFacultyPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [facultyLoading, setFacultyLoading] = useState(false);

  // General error message
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync tab from query param if changed
  useEffect(() => {
    if (tabParam === 'faculty' || tabParam === 'mentor') {
      setActiveTab('faculty');
    } else if (tabParam === 'student') {
      setActiveTab('student');
    }
  }, [tabParam]);

  // =========================================================================
  // 1. STUDENT LOGIN: 1-Click Institutional Google OAuth
  // =========================================================================
  const handleGoogleOAuth = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);

    try {
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (err: any) {
      console.warn('[Google OAuth Error]', err);
      if (err.message?.includes('provider is not enabled')) {
        setErrorMsg(
          'Google authentication provider is not yet enabled in this Supabase environment. Please configure Google OAuth in your Supabase project dashboard.'
        );
      } else {
        setErrorMsg(err.message || 'Google sign-in could not be initiated.');
      }
      setGoogleLoading(false);
    }
  };

  // Student Email Pre-check Form with Google OAuth Launch
  const handleVerifyAndSignInWithGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = googleEmailInput.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Please enter your registered college Google Mail address.');
      return;
    }

    setErrorMsg(null);
    setGoogleLoading(true);

    try {
      // 1. Check against official classroom roster
      const checkRes = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const checkData = await checkRes.json();

      if (!checkRes.ok || !checkData.registered) {
        throw new Error(
          checkData.error ||
            `Access Denied: The Google account "${cleanEmail}" is not registered in the official CBIT AI&DS Section 2 classroom roster.`
        );
      }

      // 2. Pre-check passed — initiate Google OAuth with login_hint
      const supabase = createClient();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: {
            login_hint: cleanEmail,
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (err: any) {
      console.warn('[Google Sign-In Error]', err);
      if (err.message?.includes('provider is not enabled')) {
        setErrorMsg(
          'Google authentication provider is not yet enabled in this Supabase environment. Please configure Google OAuth in your Supabase project dashboard.'
        );
      } else {
        setErrorMsg(err.message || 'Google Sign-In could not be initiated.');
      }
      setGoogleLoading(false);
    }
  };

  // =========================================================================
  // 2. FACULTY & ADMIN LOGIN: College Email & Password Authentication
  // =========================================================================
  const handleFacultySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = facultyEmail.trim().toLowerCase();
    const cleanPassword = facultyPassword;

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Please enter both your college email and password.');
      return;
    }

    setErrorMsg(null);
    setFacultyLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanEmail, password: cleanPassword }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid college email or password.');
      }

      // Update local storage and context state
      if (data.user) {
        setCurrentUser(data.user);
        try {
          localStorage.setItem('cbit_current_user', JSON.stringify(data.user));
          localStorage.setItem(`cbit_profile_${data.user.role}`, JSON.stringify(data.user));
          localStorage.setItem('cbit_mar_active_role', data.user.role);
          localStorage.setItem('cbit_is_auth', 'true');
        } catch (e) {}
      }

      // If user is required to reset temporary password on first login
      if (data.must_change_password) {
        router.push('/settings?requirePasswordChange=true');
        return;
      }

      // Route to designated role portal
      if (data.redirect) {
        router.push(data.redirect);
        return;
      }

      const role = data.user?.role;
      if (role === 'mentor') router.push('/mentor');
      else if (role === 'class_teacher') router.push('/teacher');
      else if (role === 'hod') router.push('/hod');
      else if (role === 'admin') router.push('/admin');
      else router.push('/mentor');
    } catch (err: any) {
      setErrorMsg(err.message || 'Faculty login failed. Please check your credentials.');
    } finally {
      setFacultyLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center px-4 py-8">
      {/* College Branding Header */}
      <div className="text-center space-y-2 mb-6 flex flex-col items-center max-w-2xl">
        <Link href="/" className="inline-flex items-center justify-center group mb-1">
          <img
            src="/images/cbit-logo.png"
            alt="Chaitanya Bharathi Institute of Technology (Autonomous)"
            className="h-16 sm:h-20 w-auto object-contain dark:brightness-110 dark:contrast-125 group-hover:scale-102 transition-transform"
          />
        </Link>
        <h1 className="text-xl sm:text-2xl font-serif font-black text-[#385529] dark:text-gray-100 tracking-tight">
          Student Portfolio Management System
        </h1>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
          Chaitanya Bharathi Institute of Technology (Autonomous)
        </p>
        <p className="text-[11px] text-[#a16b15] dark:text-amber-400 font-semibold tracking-wide uppercase">
          Dept. of Artificial Intelligence &amp; Data Science (AI&amp;DS) · B.E. 2024-2028
        </p>
      </div>

      {/* Global Alert Notification Banner */}
      {(errorMsg || urlError) && (
        <div className="w-full max-w-5xl mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-start space-x-3 text-xs text-red-700 dark:text-red-300 shadow-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="flex-1 leading-relaxed">
            {errorMsg ? (
              errorMsg
            ) : urlError === 'unauthorized_email' ? (
              <span>
                <strong>Access Restricted:</strong> The Google account (<strong>{unauthorizedEmail}</strong>) is not registered in the official CBIT AI&amp;DS classroom roster. Please sign in with your college-registered Google Mail.
              </span>
            ) : (
              urlError
            )}
          </div>
        </div>
      )}

      {/* Mobile Tab Switcher (Visible only on small screens < md) */}
      <div className="md:hidden w-full max-w-md mb-6 p-1.5 rounded-2xl bg-gray-100 dark:bg-[#1a1b20] border border-gray-200 dark:border-[#2e3039] grid grid-cols-2 gap-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setActiveTab('student');
            setErrorMsg(null);
          }}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            activeTab === 'student'
              ? 'bg-[#385529] text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Student Login</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('faculty');
            setErrorMsg(null);
          }}
          className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            activeTab === 'faculty'
              ? 'bg-[#a16b15] text-white shadow-md'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Faculty &amp; Staff</span>
        </button>
      </div>

      {/* Main Container: Dual Cards Side-by-Side on Desktop, Responsive on Mobile */}
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* ========================================================================= */}
        {/* CARD 1: STUDENT LOGIN (INSTITUTIONAL GOOGLE AUTHENTICATION ONLY)          */}
        {/* ========================================================================= */}
        <div
          className={`bg-white dark:bg-[#1a1b20] rounded-3xl p-6 sm:p-8 border border-[#e8e3d8] dark:border-[#2c2d36] shadow-xl flex flex-col justify-between transition-all ${
            activeTab !== 'student' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="space-y-5">
            {/* Header Badge & Title */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[#385529] dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Google Authentication</span>
                </span>
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500">
                  Students Only
                </span>
              </div>

              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center text-[#385529] dark:text-emerald-400 shrink-0">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 font-serif">
                    Student Portal Login
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    B.E. AI&amp;DS Section 2 (Class of 2028)
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-1">
                Students authenticate exclusively using their registered institutional Google account. Password login is strictly restricted.
              </p>
            </div>

            {/* Primary Action: 1-Click Institutional Google OAuth */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleGoogleOAuth}
                disabled={googleLoading}
                className="w-full py-3.5 px-4 bg-white dark:bg-[#121214] hover:bg-emerald-50/40 dark:hover:bg-[#1f2026] text-gray-800 dark:text-gray-100 font-bold text-xs rounded-xl border-2 border-emerald-600/40 dark:border-emerald-500/40 shadow-sm hover:shadow-md transition-all flex items-center justify-center space-x-3 cursor-pointer group disabled:opacity-50"
              >
                {googleLoading ? (
                  <div className="w-4 h-4 border-2 border-[#385529] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>Sign In with Institutional Google</span>
              </button>

              {/* Visual Divider */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-gray-200 dark:border-[#2e3039] w-full"></div>
                <span className="bg-white dark:bg-[#1a1b20] px-3 text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider">
                  or verify email before sign-in
                </span>
              </div>

              {/* Roster Pre-check Form */}
              <form onSubmit={handleVerifyAndSignInWithGoogle} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                    Registered Google Mail
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. 160124771xxx@cbit.org.in"
                      value={googleEmailInput}
                      onChange={(e) => setGoogleEmailInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-gray-300 dark:border-[#2e3039] bg-gray-50/50 dark:bg-[#121214] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#385529] font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={googleLoading}
                  className="w-full py-2.5 bg-[#385529] hover:bg-[#273e1c] dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <span>{googleLoading ? 'Checking Roster...' : 'Verify Roster & Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Student Footer Note & Switcher */}
          <div className="pt-6 mt-6 border-t border-gray-100 dark:border-[#2a2b33] space-y-2">
            <div className="flex items-start space-x-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              <Info className="w-4 h-4 text-[#385529] dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Access is restricted to pre-registered 67 student accounts. Unauthorized Google accounts are rejected and purged automatically.
              </span>
            </div>

            <div className="md:hidden pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('faculty');
                  setErrorMsg(null);
                }}
                className="text-xs font-bold text-[#a16b15] hover:underline cursor-pointer"
              >
                Are you a faculty member? Go to Faculty Login →
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CARD 2: FACULTY & ADMIN LOGIN (COLLEGE EMAIL & PASSWORD AUTHENTICATION)   */}
        {/* ========================================================================= */}
        <div
          className={`bg-white dark:bg-[#1a1b20] rounded-3xl p-6 sm:p-8 border border-[#e8e3d8] dark:border-[#2c2d36] shadow-xl flex flex-col justify-between transition-all ${
            activeTab !== 'faculty' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="space-y-5">
            {/* Header Badge & Title */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950/60 text-[#a16b15] dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Email &amp; Password</span>
                </span>
                <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500">
                  Staff &amp; Admin
                </span>
              </div>

              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-[#a16b15] dark:text-amber-400 shrink-0">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 font-serif">
                    Faculty &amp; Staff Login
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Mentors · Class Teachers · HoD · Admin
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-1">
                Faculty members authenticate directly using their college email address and individual password. Does not require Google OAuth.
              </p>
            </div>

            {/* Faculty Password Form */}
            <form onSubmit={handleFacultySignIn} className="space-y-3.5 pt-2">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
                  College Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. yourname@cbit.ac.in"
                    value={facultyEmail}
                    onChange={(e) => setFacultyEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-gray-300 dark:border-[#2e3039] bg-gray-50/50 dark:bg-[#121214] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#a16b15] font-medium"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Min. 8 characters
                  </span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
                    value={facultyPassword}
                    onChange={(e) => setFacultyPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 text-xs rounded-xl border border-gray-300 dark:border-[#2e3039] bg-gray-50/50 dark:bg-[#121214] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#a16b15] font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={facultyLoading}
                className="w-full py-3 bg-[#a16b15] hover:bg-[#85550e] text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 border-b-2 border-[#73490b] cursor-pointer disabled:opacity-50 mt-1"
              >
                {facultyLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Sign In as Faculty</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Faculty Footer Note & Assistance */}
          <div className="pt-6 mt-6 border-t border-gray-100 dark:border-[#2a2b33] space-y-2">
            <div className="flex items-start space-x-2 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              <Sparkles className="w-4 h-4 text-[#a16b15] dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                First-time login: You will be prompted to set a permanent password. Student accounts are rejected from password login.
              </span>
            </div>

            <div className="md:hidden pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('student');
                  setErrorMsg(null);
                }}
                className="text-xs font-bold text-[#385529] hover:underline cursor-pointer"
              >
                Are you a student? Go to Student Login →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Institutional Privacy & Security Notice */}
      <div className="text-center pt-8 max-w-lg">
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
          Official System for Chaitanya Bharathi Institute of Technology (Autonomous).
          All sessions, authentication events and IP addresses are cryptographically signed, logged and monitored.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[82vh] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#385529] border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
