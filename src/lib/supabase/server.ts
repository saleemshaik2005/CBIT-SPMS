import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '../supabase-admin';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Can be safely ignored if called from read-only route
        }
      },
    },
  });
}

/**
 * Returns the verified user session and profile from Supabase Auth cookies.
 * Rejects forged or unsigned tokens.
 */
export async function getAuthenticatedUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return { user: null, profile: null, error: error?.message || 'Unauthorized' };
    }

    // 1. Fetch caller's profile via session client
    let { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // 2. If not found by ID, query via supabaseAdmin by email (handles pre-seeded UUID mismatch)
    if (!profile && user.email) {
      const email = user.email.toLowerCase().trim();
      const { data: adminProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .ilike('email', email)
        .maybeSingle();

      if (adminProfile) {
        if (adminProfile.id !== user.id) {
          try {
            await supabaseAdmin
              .from('profiles')
              .update({ id: user.id, updated_at: new Date().toISOString() })
              .eq('email', email);
            adminProfile.id = user.id;
          } catch (syncErr) {
            console.warn('[getAuthenticatedUser] UUID sync note:', syncErr);
          }
        }
        profile = adminProfile;
      }
    }

    return { user, profile: profile || null, error: null };
  } catch (err: any) {
    return { user: null, profile: null, error: err.message || 'Session verification failed' };
  }
}
