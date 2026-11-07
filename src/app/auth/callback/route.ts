import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validateLoginMethodForRole, isStagingEnvironment } from '@/lib/auth';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const appOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : origin;

  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (error) {
    console.error('[OAuth Callback] Error from provider:', error, errorDescription);
    return NextResponse.redirect(
      `${appOrigin}/login?error=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (code) {
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
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore in server action
            }
          },
        },
      }
    );

    const {
      data: { session },
      error: exchangeError,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError || !session?.user?.email) {
      console.error('[OAuth Callback] Code exchange failed:', exchangeError);
      return NextResponse.redirect(
        `${appOrigin}/login?error=Authentication%20failed.%20Please%20try%20again.`
      );
    }

    const email = session.user.email.toLowerCase().trim();

    // 1. Verify against profiles table
    let { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*, mentor:mentor_id(id, full_name, email, phone_number)')
      .ilike('email', email)
      .maybeSingle();

    // Staging / Preview environment: Auto-provision authorized testing student if not yet in database
    const isStagingEnv = isStagingEnvironment(appOrigin);

    if (!profile && isStagingEnv && email === 'saleemshaik2005@gmail.com') {
      console.log(`[OAuth Callback] Staging detected: Auto-provisioning authorized student: ${email}`);

      // Lookup a mentor in staging profiles
      const { data: mentor } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'mentor')
        .limit(1)
        .maybeSingle();

      const stagingStudentProfile = {
        id: session.user.id,
        email: email,
        full_name: 'SHAIK SALEEM',
        role: 'student',
        roll_number: '160124771129',
        department: 'Artificial Intelligence and Data Science (AI&DS)',
        section: '2',
        batch_year: '2024-2028 (5th Semester)',
        is_lateral_entry: false,
        mentor_id: mentor?.id || null,
        login_method: 'google',
        must_change_password: false,
        is_active: true,
        skills: ['Python', 'TensorFlow', 'React', 'Next.js', 'AI OCR', 'SQL'],
        github_url: 'https://github.com/saleemshaik2005',
        linkedin_url: 'https://linkedin.com/in/saleemshaik',
        updated_at: new Date().toISOString(),
      };

      const { data: createdProfile, error: createProfileErr } = await supabaseAdmin
        .from('profiles')
        .upsert(stagingStudentProfile, { onConflict: 'id' })
        .select('*, mentor:mentor_id(id, full_name, email, phone_number)')
        .single();

      if (!createProfileErr && createdProfile) {
        profile = createdProfile;
      } else {
        console.error('[OAuth Callback] Staging auto-provision error:', createProfileErr);
      }
    }

    // 2. If profile exists with a different UUID (e.g. from manual pre-seed), sync with session.user.id
    if (profile && profile.id !== session.user.id) {
      console.log(`[OAuth Callback] Synchronizing profile UUID: ${profile.id} -> ${session.user.id}`);
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ id: session.user.id, updated_at: new Date().toISOString() })
          .eq('email', email);
        profile.id = session.user.id;
      } catch (syncErr) {
        console.warn('[OAuth Callback] UUID sync note:', syncErr);
      }
    }

    // A valid student MUST have an official CBIT roll_number (prevents auto-created trigger rows from bypassing whitelist)
    const isUnauthorized =
      !profile || (profile.role === 'student' && (!profile.roll_number || profile.roll_number.trim() === ''));

    if (isUnauthorized) {
      console.warn(`[OAuth Callback] Blocked unauthorized Google login attempt: ${email}`);
      await supabase.auth.signOut();

      // Purge any auto-created auth.users / profiles row for this unauthorized Google account
      try {
        await supabaseAdmin.from('profiles').delete().eq('id', session.user.id);
        await supabaseAdmin.auth.admin.deleteUser(session.user.id);
      } catch (cleanupErr) {
        console.warn('[OAuth Callback] Cleanup warning:', cleanupErr);
      }

      return NextResponse.redirect(
        `${appOrigin}/login?error=unauthorized_email&unauthorized_email=${encodeURIComponent(email)}`
      );
    }

    // Reject deactivated accounts
    if (profile.is_active === false) {
      console.warn(`[OAuth Callback] Inactive account attempted login: ${email}`);
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${appOrigin}/login?error=${encodeURIComponent('Your account has been deactivated. Please contact the administrator.')}`
      );
    }

    // Google login must reject faculty/admin accounts configured for password login
    const methodCheck = validateLoginMethodForRole(profile.role, 'google');
    if (!methodCheck.allowed) {
      console.warn(`[OAuth Callback] Password-only account attempted Google sign-in: ${email}`);
      await supabase.auth.signOut();
      return NextResponse.redirect(
        `${appOrigin}/login?error=${encodeURIComponent(methodCheck.error!)}`
      );
    }

    // Determine target route based on role
    let redirectPath = '/student';
    if (profile.role === 'mentor') redirectPath = '/mentor';
    else if (profile.role === 'class_teacher') redirectPath = '/teacher';
    else if (profile.role === 'hod') redirectPath = '/hod';
    else if (profile.role === 'admin') redirectPath = '/admin';

    // Sync Google OAuth avatar to database if profile does not have one
    const googleAvatar =
      session.user.user_metadata?.avatar_url ||
      session.user.user_metadata?.picture ||
      null;

    let effectiveAvatar = profile.avatar_url;
    if (!effectiveAvatar && googleAvatar) {
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ avatar_url: googleAvatar, updated_at: new Date().toISOString() })
          .eq('id', profile.id);
        effectiveAvatar = googleAvatar;
      } catch (avatarSyncErr) {
        console.warn('[OAuth Callback] Avatar sync warning:', avatarSyncErr);
      }
    }

    // Build hydrated safe user profile
    const authenticatedUserProfile = {
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
      mentor_name: profile.mentor?.full_name || undefined,
      mentor_email: profile.mentor?.email || undefined,
      mentor_phone: profile.mentor?.phone_number || undefined,
      avatar_url: effectiveAvatar || undefined,
      phone_number: profile.phone_number || undefined,
      skills: profile.skills || [],
      github_url: profile.github_url || undefined,
      linkedin_url: profile.linkedin_url || undefined,
      resume_url: profile.resume_url || undefined,
      login_method: 'google',
      must_change_password: false,
      is_active: true,
    };

    const targetUrl = new URL(redirectPath, appOrigin);

    // Return HTML bridging page that synchronizes AppContext localStorage state before redirecting
    const serializedProfile = JSON.stringify(authenticatedUserProfile);
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Synchronizing Session...</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #faf9f5; color: #385529; }
    .loader { width: 36px; height: 36px; border: 3px solid #e8e3d8; border-top-color: #385529; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div style="text-align: center;">
    <div class="loader" style="margin: 0 auto 16px auto;"></div>
    <div style="font-weight: bold; font-size: 15px;">Synchronizing Session...</div>
    <div style="font-size: 12px; color: #666; margin-top: 4px;">Connecting verified institutional account</div>
  </div>
  <script>
    try {
      var user = ${serializedProfile};
      localStorage.setItem('cbit_current_user', JSON.stringify(user));
      localStorage.setItem('cbit_profile_' + user.role, JSON.stringify(user));
      localStorage.setItem('cbit_mar_active_role', user.role);
      localStorage.setItem('cbit_is_auth', 'true');
      window.location.replace('${targetUrl.pathname}');
    } catch (e) {
      console.error(e);
      window.location.replace('/login?error=' + encodeURIComponent('Failed to synchronize session'));
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }

  return NextResponse.redirect(`${appOrigin}/login?error=Missing%20authorization%20code.`);
}
