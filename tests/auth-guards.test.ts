import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoleAccess, validateLoginMethodForRole, isStagingEnvironment } from '@/lib/auth';
import { UserProfile, UserRole } from '@/types';

describe('Role Authorization Matrix & Guard Enforcement', () => {
  const activeStudentProfile: Partial<UserProfile> = {
    id: 'student-uuid-1',
    email: '160122733001@cbit.org.in',
    role: 'student',
    is_active: true,
    must_change_password: false,
  };

  const activeMentorProfile: Partial<UserProfile> = {
    id: 'mentor-uuid-1',
    email: 'faculty.mentor@cbit.ac.in',
    role: 'mentor',
    is_active: true,
    must_change_password: false,
  };

  const activeClassTeacherProfile: Partial<UserProfile> = {
    id: 'ct-uuid-1',
    email: 'class.teacher@cbit.ac.in',
    role: 'class_teacher',
    is_active: true,
    must_change_password: false,
  };

  const activeHodProfile: Partial<UserProfile> = {
    id: 'hod-uuid-1',
    email: 'hod.cse@cbit.ac.in',
    role: 'hod',
    is_active: true,
    must_change_password: false,
  };

  const activeAdminProfile: Partial<UserProfile> = {
    id: 'admin-uuid-1',
    email: 'admin@cbit.ac.in',
    role: 'admin',
    is_active: true,
    must_change_password: false,
  };

  it('permits student role on student-allowed endpoints', () => {
    const check = evaluateRoleAccess(activeStudentProfile, ['student']);
    assert.equal(check.allowed, true);
    assert.equal(check.status, 200);
  });

  it('rejects student role on faculty/admin endpoints', () => {
    const facultyRoles: UserRole[] = ['mentor', 'class_teacher', 'hod', 'admin'];
    const check = evaluateRoleAccess(activeStudentProfile, facultyRoles);
    assert.equal(check.allowed, false);
    assert.equal(check.status, 403);
    assert.match(check.reason || '', /Insufficient privileges/i);
  });

  it('permits all faculty roles on review/approval endpoints', () => {
    const facultyRoles: UserRole[] = ['mentor', 'class_teacher', 'hod', 'admin'];
    assert.equal(evaluateRoleAccess(activeMentorProfile, facultyRoles).allowed, true);
    assert.equal(evaluateRoleAccess(activeClassTeacherProfile, facultyRoles).allowed, true);
    assert.equal(evaluateRoleAccess(activeHodProfile, facultyRoles).allowed, true);
    assert.equal(evaluateRoleAccess(activeAdminProfile, facultyRoles).allowed, true);
  });

  it('blocks inactive user accounts regardless of their role', () => {
    const inactiveMentor: Partial<UserProfile> = {
      ...activeMentorProfile,
      is_active: false,
    };
    const check = evaluateRoleAccess(inactiveMentor, ['mentor']);
    assert.equal(check.allowed, false);
    assert.equal(check.status, 403);
    assert.match(check.reason || '', /deactivated/i);
  });

  it('blocks access when must_change_password is true, unless explicitly allowed', () => {
    const pendingPasswordChange: Partial<UserProfile> = {
      ...activeMentorProfile,
      must_change_password: true,
    };

    // Standard endpoint blocked
    const standardCheck = evaluateRoleAccess(pendingPasswordChange, ['mentor']);
    assert.equal(standardCheck.allowed, false);
    assert.equal(standardCheck.status, 403);
    assert.match(standardCheck.reason || '', /change your temporary password/i);

    // Password change endpoint exempted
    const exemptedCheck = evaluateRoleAccess(pendingPasswordChange, ['mentor'], {
      allowMustChangePassword: true,
    });
    assert.equal(exemptedCheck.allowed, true);
    assert.equal(exemptedCheck.status, 200);
  });

  it('rejects unauthenticated or non-existent profile', () => {
    const check = evaluateRoleAccess(null, ['student']);
    assert.equal(check.allowed, false);
    assert.equal(check.status, 403);
  });

  it('strictly isolates student login: rejects student accounts from faculty password login', () => {
    const result = validateLoginMethodForRole('student', 'password');
    assert.equal(result.allowed, false);
    assert.match(result.error || '', /Students must authenticate using official Google Sign-In/i);
  });

  it('strictly isolates faculty login: rejects faculty accounts from student Google login', () => {
    const mentorResult = validateLoginMethodForRole('mentor', 'google');
    assert.equal(mentorResult.allowed, false);
    assert.match(mentorResult.error || '', /Faculty and administrative accounts must sign in using college email and password/i);

    const teacherResult = validateLoginMethodForRole('class_teacher', 'google');
    assert.equal(teacherResult.allowed, false);

    const hodResult = validateLoginMethodForRole('hod', 'google');
    assert.equal(hodResult.allowed, false);

    const adminResult = validateLoginMethodForRole('admin', 'google');
    assert.equal(adminResult.allowed, false);
  });

  it('permits valid login methods for respective roles', () => {
    assert.equal(validateLoginMethodForRole('student', 'google').allowed, true);
    assert.equal(validateLoginMethodForRole('mentor', 'password').allowed, true);
    assert.equal(validateLoginMethodForRole('class_teacher', 'password').allowed, true);
    assert.equal(validateLoginMethodForRole('hod', 'password').allowed, true);
    assert.equal(validateLoginMethodForRole('admin', 'password').allowed, true);
  });

  it('accurately identifies staging preview environments while protecting production', () => {
    // Staging and preview hosts
    assert.equal(isStagingEnvironment('cbitspms-git-dev-saleemshaik2005s-projects.vercel.app'), true);
    assert.equal(isStagingEnvironment('localhost:3000'), true);
    assert.equal(isStagingEnvironment('127.0.0.1:3000'), true);
    assert.equal(isStagingEnvironment('https://my-preview-deployment.vercel.app'), true);

    // Live production domain must strictly NOT be recognized as staging
    const envObj = process.env as Record<string, string | undefined>;
    const originalEnv = envObj.NODE_ENV;
    const originalNextEnv = envObj.NEXT_PUBLIC_ENVIRONMENT;
    const originalVercelEnv = envObj.VERCEL_ENV;
    try {
      delete envObj.NEXT_PUBLIC_ENVIRONMENT;
      delete envObj.VERCEL_ENV;
      envObj.NODE_ENV = 'production';
      assert.equal(isStagingEnvironment('cbitspms.vercel.app'), false);
      assert.equal(isStagingEnvironment('https://cbitspms.vercel.app'), false);
    } finally {
      envObj.NODE_ENV = originalEnv;
      if (originalNextEnv) envObj.NEXT_PUBLIC_ENVIRONMENT = originalNextEnv;
      if (originalVercelEnv) envObj.VERCEL_ENV = originalVercelEnv;
    }
  });
});
