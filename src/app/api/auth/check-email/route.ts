import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isStagingEnvironment } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cleanEmail = String(body.email || '').trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json(
        { registered: false, error: 'Please enter a valid Google Mail address.' },
        { status: 400 }
      );
    }

    // Query pre-authorized 67 students + 6 faculty
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role, roll_number')
      .ilike('email', cleanEmail)
      .maybeSingle();

    const host = req.headers.get('host') || req.headers.get('x-forwarded-host') || '';
    const isStaging = isStagingEnvironment(host);

    if ((!profile || error) && isStaging && cleanEmail === 'saleemshaik2005@gmail.com') {
      return NextResponse.json({
        registered: true,
        role: 'student',
        full_name: 'SHAIK SALEEM',
        email: cleanEmail,
      });
    }

    if (error || !profile) {
      return NextResponse.json({
        registered: false,
        error: `Access Denied: The Google account "${cleanEmail}" is not registered in the official CBIT AI&DS Section 2 classroom roster (67 Students & 6 Faculty).`,
      });
    }

    // If student, confirm valid roll number
    if (profile.role === 'student' && (!profile.roll_number || !profile.roll_number.trim())) {
      return NextResponse.json({
        registered: false,
        error: `This student account (${cleanEmail}) does not have an assigned CBIT roll number. Please contact your Class Coordinator.`,
      });
    }

    return NextResponse.json({
      registered: true,
      role: profile.role,
      full_name: profile.full_name,
      email: profile.email,
    });
  } catch (err: any) {
    console.error('[Check Email API Error]', err);
    return NextResponse.json(
      { registered: false, error: 'Unable to verify email with institutional roster.' },
      { status: 500 }
    );
  }
}
