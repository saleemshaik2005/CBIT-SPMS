import { NextRequest, NextResponse } from 'next/server';
import { UserProfile, UserRole } from '@/types';
import { getAuthenticatedUser } from './supabase/server';
import { supabaseAdmin } from './supabase-admin';

export interface AuthContext {
  user: { id: string; email?: string } | null;
  profile: UserProfile | null;
  error?: string | null;
  response?: NextResponse | null;
}

export interface RequireRoleOptions {
  allowMustChangePassword?: boolean;
}

/**
 * Asserts whether a login method ('google' vs 'password') is authorized for the given role.
 * - Students must strictly authenticate through 'google'.
 * - Faculty and Admins must strictly authenticate through 'password'.
 */
export function validateLoginMethodForRole(
  role: UserRole | string | undefined,
  method: 'google' | 'password'
): { allowed: boolean; error?: string } {
  if (role === 'student' && method === 'password') {
    return {
      allowed: false,
      error: 'Students must authenticate using official Google Sign-In. Password login is restricted to Faculty and Administration.',
    };
  }

  if (role && role !== 'student' && method === 'google') {
    return {
      allowed: false,
      error: 'Faculty and administrative accounts must sign in using college email and password.',
    };
  }

  return { allowed: true };
}

/**
 * Pure evaluation function for role access matrix, active state, and password change requirement.
 */
export function evaluateRoleAccess(
  profile: Partial<UserProfile> | null | undefined,
  allowedRoles: UserRole[] = [],
  options: RequireRoleOptions = {}
): { allowed: boolean; reason?: string; status: number } {
  if (!profile) {
    return {
      allowed: false,
      reason: 'Your account is not registered in the system.',
      status: 403,
    };
  }

  if (profile.is_active === false) {
    return {
      allowed: false,
      reason: 'Your account has been deactivated. Please contact the administrator.',
      status: 403,
    };
  }

  if (profile.must_change_password === true && !options.allowMustChangePassword) {
    return {
      allowed: false,
      reason: 'You must change your temporary password before accessing the system.',
      status: 403,
    };
  }

  if (allowedRoles.length > 0 && (!profile.role || !allowedRoles.includes(profile.role as UserRole))) {
    return {
      allowed: false,
      reason: 'Access forbidden: Insufficient privileges.',
      status: 403,
    };
  }

  return { allowed: true, status: 200 };
}

/**
 * Server-side authorization guard.
 * Validates the caller's cryptographic Supabase session cookie, verifies that the account is active,
 * checks if password change is pending, and asserts that the authoritative database role is in allowedRoles.
 */
export async function requireRole(
  allowedRoles: UserRole[] = [],
  options: RequireRoleOptions = {}
): Promise<AuthContext> {
  const { user, profile: initialProfile, error } = await getAuthenticatedUser();

  if (error || !user) {
    return {
      user: null,
      profile: null,
      error: error || 'Authentication required.',
      response: NextResponse.json(
        { success: false, error: 'Authentication required. Please sign in.' },
        { status: 401 }
      ),
    };
  }

  // Fetch or re-verify authoritative profile directly from database
  let profile = initialProfile;
  if (!profile) {
    const { data: dbProfile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profile = dbProfile;
  }

  const access = evaluateRoleAccess(profile, allowedRoles, options);
  if (!access.allowed) {
    return {
      user,
      profile: profile || null,
      error: access.reason,
      response: NextResponse.json(
        {
          success: false,
          error: access.reason,
          ...(profile?.must_change_password && !options.allowMustChangePassword
            ? { must_change_password: true }
            : {}),
        },
        { status: access.status }
      ),
    };
  }

  return {
    user,
    profile,
    error: null,
    response: null,
  };
}
