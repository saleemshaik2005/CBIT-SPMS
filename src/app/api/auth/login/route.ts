import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validateLoginMethodForRole } from '@/lib/auth';

// In-memory rate limiting map (IP and Email)
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

function checkRateLimit(key: string): { isLocked: boolean; waitSeconds: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.lockedUntil > now) {
    return {
      isLocked: true,
      waitSeconds: Math.ceil((attempt.lockedUntil - now) / 1000),
    };
  }
  return { isLocked: false, waitSeconds: 0 };
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
  const newCount = attempt.count + 1;
  let lockedUntil = 0;

  if (newCount >= 5) {
    lockedUntil = now + 15 * 60 * 1000; // 15-minute lock after 5 failures
  } else if (newCount >= 3) {
    lockedUntil = now + 60 * 1000; // 1-minute lock after 3 failures
  }

  loginAttempts.set(key, { count: newCount, lockedUntil });
}

function clearAttempts(key: string) {
  loginAttempts.delete(key);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const ipLimit = checkRateLimit(`ip:${ip}`);
    if (ipLimit.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many login attempts from this network. Please try again in ${ipLimit.waitSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { identifier, password } = body;

    if (!identifier || !password) {
      return NextResponse.json(
        { success: false, error: 'Email/ID and password are required.' },
        { status: 400 }
      );
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const emailLimit = checkRateLimit(`email:${cleanId}`);
    if (emailLimit.isLocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts for this account. Please wait ${emailLimit.waitSeconds} seconds.`,
        },
        { status: 429 }
      );
    }

    // 1. Resolve Profile in Database
    let query = supabaseAdmin.from('profiles').select('*');
    if (cleanId.includes('@')) {
      query = query.ilike('email', cleanId);
    } else {
      query = query.eq('roll_number', cleanId);
    }

    const { data: profile, error: pErr } = await query.maybeSingle();

    if (pErr) {
      console.error('[Login API] Database query error:', pErr);
      return NextResponse.json(
        { success: false, error: 'Database service is currently unavailable. Please try again.' },
        { status: 503 }
      );
    }

    // Generic error to prevent account enumeration
    const genericAuthError = 'Invalid email or password.';

    if (!profile) {
      recordFailedAttempt(`ip:${ip}`);
      recordFailedAttempt(`email:${cleanId}`);
      return NextResponse.json({ success: false, error: genericAuthError }, { status: 401 });
    }

    // 2. Reject students from password login
    const methodCheck = validateLoginMethodForRole(profile.role, 'password');
    if (!methodCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: methodCheck.error,
        },
        { status: 403 }
      );
    }

    // 3. Reject deactivated accounts
    if (profile.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          error: 'This account has been deactivated. Please contact the administrator.',
        },
        { status: 403 }
      );
    }

    // 4. Authenticate using Supabase Auth with Cookie Persistence
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, {
                  ...options,
                  secure: process.env.NODE_ENV === 'production',
                  sameSite: 'lax',
                  httpOnly: true,
                });
              });
            } catch {
              // Ignore in read-only cases
            }
          },
        },
      }
    );

    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: cleanPassword,
    });

    if (authErr || !authData?.user) {
      recordFailedAttempt(`ip:${ip}`);
      recordFailedAttempt(`email:${cleanId}`);
      return NextResponse.json({ success: false, error: genericAuthError }, { status: 401 });
    }

    // Clear failed attempts on successful login
    clearAttempts(`ip:${ip}`);
    clearAttempts(`email:${cleanId}`);

    // Determine target redirect route
    let redirectPath = '/mentor';
    if (profile.role === 'class_teacher') redirectPath = '/teacher';
    else if (profile.role === 'hod') redirectPath = '/hod';
    else if (profile.role === 'admin') redirectPath = '/admin';

    const safeUserProfile = {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      roll_number: profile.roll_number || undefined,
      department: profile.department || 'Artificial Intelligence and Data Science (AI&DS)',
      section: profile.section || '2',
      batch_year: profile.batch_year || '2024-2028',
      is_lateral_entry: !!profile.is_lateral_entry,
      mentor_id: profile.mentor_id || undefined,
      avatar_url: profile.avatar_url || undefined,
      phone_number: profile.phone_number || undefined,
      skills: profile.skills || [],
      github_url: profile.github_url || undefined,
      linkedin_url: profile.linkedin_url || undefined,
      resume_url: profile.resume_url || undefined,
      login_method: 'password',
      must_change_password: !!profile.must_change_password,
      is_active: true,
    };

    return NextResponse.json({
      success: true,
      user: safeUserProfile,
      must_change_password: !!profile.must_change_password,
      redirect: profile.must_change_password ? '/settings?requirePasswordChange=true' : redirectPath,
    });
  } catch (err: any) {
    console.error('[Login API] Error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred during sign-in.' },
      { status: 500 }
    );
  }
}
