#!/usr/bin/env node

/**
 * ==============================================================================
 * CBIT SPMS — Staging Student Account Provisioning Script
 * ==============================================================================
 * Provisions the user's student account exclusively in the STAGING database.
 * Does NOT touch production. Does NOT copy other production students.
 *
 * Usage:
 *   $env:NEXT_PUBLIC_SUPABASE_URL = "https://<staging-ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "<staging-service-key>"
 *   node scripts/provision-staging-student.mjs --confirm-project-ref=<staging-ref>
 * ==============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const projectRefArg = args.find((a) => a.startsWith('--confirm-project-ref='));
const confirmedProjectRef = projectRefArg ? projectRefArg.split('=')[1].trim() : null;

const configArg = args.find((a) => a.startsWith('--config='));
const configPath = configArg
  ? path.resolve(rootDir, configArg.split('=')[1].trim())
  : path.resolve(rootDir, '.local/student.staging.json');

// 1. Load Staging Environment Variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided via environment variables.');
  process.exit(1);
}

// 2. Project Reference Safety Guard
let actualProjectRef = '';
try {
  const urlObj = new URL(supabaseUrl);
  actualProjectRef = urlObj.hostname.split('.')[0];
} catch (e) {
  console.error('ERROR: Invalid NEXT_PUBLIC_SUPABASE_URL format:', supabaseUrl);
  process.exit(1);
}

if (!confirmedProjectRef) {
  console.error('\nSAFETY GUARD TRIGGERED:');
  console.error(`You must explicitly confirm the target project ref using --confirm-project-ref=<ref>`);
  console.error(`Target detected from URL: "${actualProjectRef}"`);
  console.error('This prevents accidental execution against the wrong environment (staging vs production).\n');
  process.exit(1);
}

if (confirmedProjectRef !== actualProjectRef) {
  console.error('\nSAFETY GUARD ERROR: Project ref mismatch!');
  console.error(`Provided with --confirm-project-ref : "${confirmedProjectRef}"`);
  console.error(`Detected from SUPABASE_URL         : "${actualProjectRef}"`);
  console.error('Execution halted to protect database integrity.\n');
  process.exit(1);
}

// 3. Load Student Staging Config
if (!fs.existsSync(configPath)) {
  console.error(`ERROR: Staging student config not found at: ${configPath}`);
  process.exit(1);
}

const studentConfigList = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const student = studentConfigList[0];

if (!student || !student.email) {
  console.error('ERROR: Config file must contain valid student account details.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('================================================================');
  console.log(`CBIT SPMS Staging Student Provisioning`);
  console.log(`Target Staging Project: ${actualProjectRef}`);
  console.log(`Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);
  console.log(`Student: ${student.full_name} <${student.email}> [Roll: ${student.roll_number}]`);
  console.log('================================================================\n');

  // 1. Resolve Staging Mentor ID
  console.log(`Looking up staging mentor: ${student.mentor_email}...`);
  const { data: mentorProfile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .ilike('email', student.mentor_email)
    .maybeSingle();

  let assignedMentorId = mentorProfile?.id || null;
  if (mentorProfile) {
    console.log(` -> Found Staging Mentor: ${mentorProfile.full_name} (ID: ${mentorProfile.id})`);
  } else {
    console.warn(` -> Note: Staging mentor "${student.mentor_email}" not found. Proceeding with null mentor assignment.`);
  }

  // 2. Check existing Auth user
  console.log(`\nChecking Supabase Auth for student: ${student.email}...`);
  const { data: usersData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('ERROR querying Supabase Auth users:', listErr.message);
    process.exit(1);
  }

  const existingUser = usersData?.users?.find(
    (u) => u.email && u.email.toLowerCase() === student.email.toLowerCase()
  );

  let userId = existingUser ? existingUser.id : null;

  if (isDryRun) {
    console.log(`  [DRY-RUN] Auth User Exists: ${existingUser ? `YES (ID: ${userId})` : 'NO (Will be created)'}`);
    console.log(`  [DRY-RUN] Profile Upsert: roll_number=${student.roll_number}, role=student, login_method=google, is_active=true`);
    console.log('\n[DRY-RUN COMPLETE] Zero changes were made.');
    return;
  }

  if (existingUser) {
    console.log(` -> Existing Auth user found. Preserving UUID: ${userId}`);
    await supabase.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        full_name: student.full_name,
        roll_number: student.roll_number,
        role: 'student',
      },
    });
  } else {
    console.log(` -> Creating new Auth user for ${student.email} with email confirmation...`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: student.email,
      email_confirm: true,
      user_metadata: {
        full_name: student.full_name,
        roll_number: student.roll_number,
        role: 'student',
      },
    });

    if (createErr) {
      console.error('ERROR creating Auth user:', createErr.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log(` -> Created Auth user successfully. UUID: ${userId}`);
  }

  // 3. Upsert into public.profiles
  console.log(`\nUpserting student record into public.profiles...`);
  const profilePayload = {
    id: userId,
    email: student.email.toLowerCase().trim(),
    full_name: student.full_name,
    role: 'student',
    roll_number: student.roll_number,
    department: student.department || 'Artificial Intelligence and Data Science (AI&DS)',
    section: student.section || '2',
    batch_year: student.batch_year || '2024-2028 (5th Semester)',
    is_lateral_entry: !!student.is_lateral_entry,
    mentor_id: assignedMentorId,
    login_method: 'google',
    must_change_password: false,
    is_active: true,
    skills: student.skills || [],
    github_url: student.github_url || null,
    linkedin_url: student.linkedin_url || null,
    updated_at: new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (upsertErr) {
    console.error('ERROR upserting student profile:', upsertErr.message);
    process.exit(1);
  }

  console.log(' -> Student profile successfully upserted in staging!');
  console.log('\n================================================================');
  console.log('Staging Student Provisioning Complete!');
  console.log(`Email:       ${profilePayload.email}`);
  console.log(`Roll Number: ${profilePayload.roll_number}`);
  console.log(`Role:        ${profilePayload.role}`);
  console.log(`Mentor ID:   ${profilePayload.mentor_id || 'None'}`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
