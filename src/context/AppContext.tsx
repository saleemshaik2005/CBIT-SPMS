'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  UserProfile,
  StudentSubmission,
  ActivityCategory,
  SystemSettings,
  UserRole,
  AIExtractionResult,
  ThemeMode,
  NotificationItem,
  SubmissionMessage,
} from '@/types';
import {
  CBIT_24_CATEGORIES,
  MOCK_CURRENT_USER,
  MOCK_SUBMISSIONS,
  DEFAULT_REGULAR_TARGET_POINTS,
  DEFAULT_REGULAR_MAX_POINTS,
  DEFAULT_LATERAL_ENTRY_TARGET_POINTS,
  DEFAULT_LATERAL_ENTRY_MAX_POINTS,
  CBIT_COLLEGE_NAME,
  CBIT_COLLEGE_CODE,
} from '@/lib/mar-constants';
import { createClient } from '@/lib/supabase/client';

interface AppContextType {
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  switchRole: (role: UserRole) => void;
  submissions: StudentSubmission[];
  categories: ActivityCategory[];
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  updateCategory: (category: ActivityCategory) => void;
  addSubmission: (submission: Omit<StudentSubmission, 'id' | 'created_at' | 'status' | 'awarded_points'> & { status?: any }) => void;
  updateSubmission: (id: string, updatedData: Partial<StudentSubmission>) => void;
  updateSubmissionStatus: (id: string, status: 'approved' | 'rejected' | 'needs_clarification', remarks?: string, awardedPoints?: number) => void;
  revokeApprovedSubmission: (id: string, reason?: string) => void;
  deleteSubmission: (id: string) => void;
  bulkApproveSubmissions: (submissionIds: string[], remarks?: string) => void;
  addSubmissionMessage: (submissionId: string, text: string) => void;
  resetToDefaults: () => void;

  // Profile Management
  updateUserAvatar: (avatarUrl: string) => void;
  updateUserProfile: (data: Partial<UserProfile>) => void;
  getStudentAvatar: (studentId?: string) => string | undefined;

  // Theme
  theme: ThemeMode;
  toggleTheme: () => void;

  // Auth
  isAuthenticated: boolean;
  login: (email: string, role?: UserRole, password?: string) => Promise<boolean>;
  loginWithGoogle: (googleEmailOrCredential?: string) => Promise<void>;
  register: (userData: Partial<UserProfile>) => Promise<boolean>;
  logout: () => void;

  // Notifications
  notifications: NotificationItem[];
  unreadCount: number;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addNotification: (item: Omit<NotificationItem, 'id' | 'created_at' | 'is_read'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const DEMO_USERS: Record<UserRole, UserProfile> = {
  student: MOCK_CURRENT_USER,
  mentor: {
    id: "378feeb5-4cd4-430e-812c-c9d95fa1734d",
    email: "shobarani_aids@cbit.ac.in",
    full_name: "Dr. Shobarani Salvadi",
    role: "mentor",
    department: "Artificial Intelligence and Data Science (AI&DS)",
    batch_year: "Assistant Professor (Faculty Mentor 1)",
    is_lateral_entry: false,
  },
  class_teacher: {
    id: "4137919d-34de-475f-914c-166da2ddcbf1",
    email: "saisreetalla_aids@cbit.ac.in",
    full_name: "Ms. Talla Sai Sree",
    role: "class_teacher",
    roll_number: "11628",
    department: "Artificial Intelligence and Data Science (AI&DS)",
    section: "2",
    batch_year: "Class Coordinator (Faculty ID: 11628)",
    is_lateral_entry: false,
  },
  hod: {
    id: "4cb6c35f-56ab-419e-8d1f-0f83c1868c10",
    email: "kradhika_aids@cbit.ac.in",
    full_name: "Dr. K. Radhika",
    role: "hod",
    department: "Artificial Intelligence and Data Science (AI&DS)",
    batch_year: "Professor & Head, AI&DS Dept.",
    is_lateral_entry: false,
  },
  admin: {
    id: "4a004de1-7e56-4616-9371-fe673a5dff96",
    email: "cbit.spms.admin@gmail.com",
    full_name: "System Administrator (Shaik Saleem)",
    role: "admin",
    roll_number: "160124771129-ADMIN",
    department: "Artificial Intelligence and Data Science (AI&DS)",
    batch_year: "SPMS Administrator & Tech Lead",
    is_lateral_entry: false,
  },
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    recipient_role: "student",
    recipient_id: "usr-student-001",
    type: "approval",
    title: "Certificate Approved (+20 Points)",
    message: "Dr. Anireddy Srilakshmi approved your NPTEL Deep Learning 12-Week Certificate.",
    link: "/student/history",
    is_read: false,
    sender_name: "Dr. Anireddy Srilakshmi",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "notif-2",
    recipient_role: "student",
    recipient_id: "usr-student-001",
    type: "approval",
    title: "Certificate Approved (+5 Points)",
    message: "Your SUDHEE 2024 Fest Core AI Team Lead submission was verified.",
    link: "/student/history",
    is_read: false,
    sender_name: "Dr. Anireddy Srilakshmi",
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: "notif-3",
    recipient_role: "mentor",
    recipient_id: "usr-mentor-001",
    type: "submission",
    title: "New Certificate Under Review",
    message: "Shaik Saleem submitted NPTEL Advanced LLMs Certification.",
    link: "/mentor",
    is_read: false,
    sender_name: "Shaik Saleem",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: "notif-4",
    recipient_role: "all",
    type: "announcement",
    title: "Semester 5 Activity Points Deadline",
    message: "All B.Tech students are advised to submit certificate proofs before the end of Sem 5.",
    link: "/student/guidelines",
    is_read: true,
    sender_name: "Academic Section Admin",
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
];

export function sanitizeUserProfile(profile: UserProfile): UserProfile {
  const cleaned = { ...profile };
  // Faculty mentors and HODs should not carry the student mock roll number 160122771045
  if (
    (cleaned.role === 'mentor' || cleaned.role === 'hod') &&
    (cleaned.roll_number === '160122771045' || cleaned.roll_number === '160124771129')
  ) {
    delete cleaned.roll_number;
  }
  // Never allow another student's profile to keep Shaik Saleem's email or default skills if their name isn't Shaik Saleem
  const isSaleem =
    (cleaned.full_name || '').toLowerCase().includes('saleem') ||
    cleaned.roll_number === '160124771129';
  if (!isSaleem) {
    if (
      cleaned.email === 'saleemshaik2005@gmail.com' ||
      cleaned.email === 'saleemshaik2005@cbit.ac.in'
    ) {
      cleaned.email = cleaned.roll_number ? `${cleaned.roll_number}@cbit.ac.in` : '';
    }
    if (
      Array.isArray(cleaned.skills) &&
      cleaned.skills.includes('AI Document Intelligence')
    ) {
      cleaned.skills = [];
    }
  }
  return cleaned;
}

export const GUEST_USER: UserProfile = {
  id: '',
  email: '',
  full_name: '',
  role: 'student',
  department: 'Artificial Intelligence and Data Science (AI&DS)',
  section: '2',
  batch_year: '2024-2028',
  is_lateral_entry: false,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(GUEST_USER);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(MOCK_SUBMISSIONS);
  const [categories, setCategories] = useState<ActivityCategory[]>(CBIT_24_CATEGORIES);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [settings, setSettings] = useState<SystemSettings>({
    id: 1,
    college_name: CBIT_COLLEGE_NAME,
    college_code: CBIT_COLLEGE_CODE,
    regular_target_points: DEFAULT_REGULAR_TARGET_POINTS,
    regular_max_points: DEFAULT_REGULAR_MAX_POINTS,
    lateral_entry_target_points: DEFAULT_LATERAL_ENTRY_TARGET_POINTS,
    lateral_entry_max_points: DEFAULT_LATERAL_ENTRY_MAX_POINTS,
    academic_year: "2025-2026",
  });

  const [serverProfiles, setServerProfiles] = useState<Record<string, UserProfile>>({});
  const lastUpdatedRef = useRef<string>('');

  const persistActiveUser = useCallback((user: UserProfile) => {
    const clean = sanitizeUserProfile(user);
    setCurrentUser(clean);
    try {
      localStorage.setItem('cbit_current_user', JSON.stringify(clean));
      localStorage.setItem(`cbit_profile_${clean.role}`, JSON.stringify(clean));
      localStorage.setItem('cbit_mar_active_role', clean.role);
      localStorage.setItem('cbit_is_auth', 'true');
    } catch (e) {}
  }, []);

  // Sync state from server database
  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        const {
          submissions: serverSubs,
          profiles,
          categories: serverCats,
          settings: serverSettings,
          notifications: serverNotifs,
          lastUpdated,
        } = json.data;

        if (lastUpdated && lastUpdated === lastUpdatedRef.current) {
          return;
        }
        if (lastUpdated) {
          lastUpdatedRef.current = lastUpdated;
        }

        if (Array.isArray(serverSubs) && serverSubs.length > 0) {
          setSubmissions(serverSubs);
          try {
            localStorage.setItem('cbit_mar_submissions', JSON.stringify(serverSubs));
          } catch (e) {}
        }

        if (Array.isArray(serverCats) && serverCats.length > 0) {
          setCategories(serverCats);
          try {
            localStorage.setItem('cbit_mar_categories', JSON.stringify(serverCats));
          } catch (e) {}
        }

        if (serverSettings) {
          setSettings(serverSettings);
          try {
            localStorage.setItem('cbit_mar_settings', JSON.stringify(serverSettings));
          } catch (e) {}
        }

        if (Array.isArray(serverNotifs) && serverNotifs.length > 0) {
          setNotifications(serverNotifs);
          try {
            localStorage.setItem('cbit_notifications', JSON.stringify(serverNotifs));
          } catch (e) {}
        }

        if (profiles) {
          setServerProfiles(profiles);
          // Do NOT overwrite currentUser with generic role profiles from cbit_db.json!
          // That was causing every student/mentor account to revert to Shaik Saleem's default values on refresh.
        }
      }
    } catch (err) {
      console.warn('[Sync Client] Failed to sync with server:', err);
    }
  }, []);

  // Dispatch mutation actions to server
  const postSyncAction = useCallback(async (action: string, payload: any) => {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.lastUpdated) {
          lastUpdatedRef.current = json.lastUpdated;
        }
      }
    } catch (err) {
      console.warn(`[Sync Client] Error syncing action "${action}":`, err);
    }
  }, []);

  // Load persisted state from localStorage and sync with server
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('cbit_theme') as ThemeMode;
      if (savedTheme) {
        setTheme(savedTheme);
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      const savedSubmissions = localStorage.getItem('cbit_mar_submissions');
      if (savedSubmissions) {
        const parsed = JSON.parse(savedSubmissions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSubmissions(parsed);
        }
      }

      const savedCategories = localStorage.getItem('cbit_mar_categories');
      if (savedCategories) setCategories(JSON.parse(savedCategories));

      const savedSettings = localStorage.getItem('cbit_mar_settings');
      if (savedSettings) setSettings(JSON.parse(savedSettings));

      const savedNotifs = localStorage.getItem('cbit_notifications');
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));

      const savedAuth = localStorage.getItem('cbit_is_auth');
      const savedUserStr = localStorage.getItem('cbit_current_user');
      if (savedAuth === 'true' && savedUserStr) {
        try {
          const parsedUser = JSON.parse(savedUserStr);
          if (parsedUser && (parsedUser.id || parsedUser.email)) {
            const clean = sanitizeUserProfile(parsedUser);
            setCurrentUser(clean);
            setIsAuthenticated(true);
          } else {
            setCurrentUser(GUEST_USER);
            setIsAuthenticated(false);
          }
        } catch (e) {
          setCurrentUser(GUEST_USER);
          setIsAuthenticated(false);
        }
      } else {
        setCurrentUser(GUEST_USER);
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.warn("Could not load from localStorage:", e);
    } finally {
      setIsHydrated(true);
    }

    // Authoritative sync with server database on mount
    syncWithServer();

    // Check active Supabase OAuth session on mount
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (session?.user?.email) {
          const email = session.user.email.toLowerCase().trim();

          // 1. First consult authoritative /api/me (cookie-verified server session)
          try {
            const meRes = await fetch('/api/me');
            if (meRes.ok) {
              const meData = await meRes.json();
              if (meData.authenticated && meData.user) {
                persistActiveUser(meData.user);
                setIsAuthenticated(true);
                return;
              }
            }
          } catch (meErr) {
            console.warn('[AppContext] /api/me lookup error:', meErr);
          }

          // 2. Direct profiles query fallback
          const { data: profile } = await supabase
            .from('profiles')
            .select('*, mentor:mentor_id(id, full_name, email, phone_number)')
            .ilike('email', email)
            .maybeSingle();

          // 3. Strict Roster Whitelist Verification:
          // Reject if profile does not exist OR if role is student without an assigned CBIT roll_number
          if (!profile || (profile.role === 'student' && !profile.roll_number)) {
            // Check if user is already authenticated in localStorage from OAuth callback bridge
            const savedUserStr = localStorage.getItem('cbit_current_user');
            if (savedUserStr) {
              try {
                const parsed = JSON.parse(savedUserStr);
                if (
                  parsed &&
                  parsed.email &&
                  parsed.email.toLowerCase().trim() === email &&
                  parsed.role === 'student' &&
                  parsed.roll_number
                ) {
                  persistActiveUser(parsed);
                  setIsAuthenticated(true);
                  return;
                }
              } catch (e) {}
            }

            await supabase.auth.signOut();
            try {
              localStorage.setItem('cbit_is_auth', 'false');
              localStorage.removeItem('cbit_current_user');
            } catch (e) {}
            setCurrentUser(GUEST_USER);
            setIsAuthenticated(false);
            if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
              window.location.href = `/login?error=unauthorized_email&unauthorized_email=${encodeURIComponent(email)}`;
            }
            return;
          }

          const authUser: UserProfile = sanitizeUserProfile({
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            role: profile.role,
            roll_number: profile.roll_number || undefined,
            department: profile.department || 'Artificial Intelligence and Data Science (AI&DS)',
            section: profile.section || '2',
            batch_year: profile.batch_year || '2024-2028 (5th Semester)',
            is_lateral_entry: !!profile.is_lateral_entry,
            mentor_id: profile.mentor_id || undefined,
            mentor_name: profile.mentor?.full_name || undefined,
            mentor_email: profile.mentor?.email || undefined,
            avatar_url: profile.avatar_url || session.user.user_metadata?.avatar_url || undefined,
            phone_number: profile.phone_number || undefined,
          });
          persistActiveUser(authUser);
          setIsAuthenticated(true);
        }
      });
    } catch (e) {
      console.warn('[AppContext] Supabase session check error:', e);
    }

    // Multi-device real-time sync listeners
    const onFocus = () => {
      syncWithServer();
    };
    window.addEventListener('focus', onFocus);

    const pollInterval = setInterval(() => {
      syncWithServer();
    }, 5000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(pollInterval);
    };
  }, [syncWithServer, persistActiveUser]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('cbit_theme', next);
        if (next === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {}
      return next;
    });
  };

  const login = async (identifier: string, role?: UserRole, password?: string): Promise<boolean> => {
    // 1. If password provided, authenticate against Supabase API
    if (password && password.trim()) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        });
        const json = await res.json();
        if (json.success && json.user) {
          const authenticatedUser: UserProfile = sanitizeUserProfile(json.user);
          persistActiveUser(authenticatedUser);
          setIsAuthenticated(true);
          return true;
        } else {
          throw new Error(json.error || 'Authentication failed. Please check your credentials.');
        }
      } catch (err: any) {
        console.error('[Login] Error:', err);
        throw err;
      }
    }

    // 2. Demo role selection fallback (when clicking quick test buttons in dev)
    let targetUser: UserProfile = MOCK_CURRENT_USER;
    if (role && DEMO_USERS[role]) {
      targetUser = DEMO_USERS[role];
    } else {
      const match = Object.values(DEMO_USERS).find(
        (u) => u.email.toLowerCase() === identifier.toLowerCase() || u.roll_number === identifier
      );
      if (match) targetUser = match;
    }

    const cleanTarget = sanitizeUserProfile(targetUser);
    persistActiveUser(cleanTarget);
    setIsAuthenticated(true);
    return true;
  };

  const register = async (_userData: Partial<UserProfile>): Promise<boolean> => {
    throw new Error(
      'Public account registration is disabled. Only pre-registered CBIT AI&DS Section 2 students and faculty are permitted.'
    );
  };

  const loginWithGoogle = async (googleEmailOrCredential?: string): Promise<void> => {
    const input = (googleEmailOrCredential || '').trim();
    if (!input) {
      throw new Error('Please enter or select your CBIT-registered Google Mail address to continue.');
    }

    const isJwt = input.split('.').length === 3 && !input.includes('@');
    if (!isJwt) {
      throw new Error('Direct email entry is disabled. Please click "Sign in with Google" to authenticate.');
    }

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'google_oauth',
        googleCredential: input,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.user) {
      throw new Error(
        data.error ||
          'Google Sign-In failed: This Google account is not registered in the CBIT AI&DS Section 2 roster.'
      );
    }

    const cleanProfile = sanitizeUserProfile(data.user);
    persistActiveUser(cleanProfile);
    setIsAuthenticated(true);
  };

  const logout = async () => {
    setIsAuthenticated(false);
    setCurrentUser(GUEST_USER);
    try {
      localStorage.setItem('cbit_is_auth', 'false');
      localStorage.removeItem('cbit_current_user');
      localStorage.removeItem('cbit_profile_student');
      localStorage.removeItem('cbit_profile_mentor');
      localStorage.removeItem('cbit_profile_class_teacher');
      localStorage.removeItem('cbit_profile_hod');
      localStorage.removeItem('cbit_profile_admin');
      localStorage.removeItem('cbit_mar_active_role');
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {}
  };

  // Sync to localStorage
  const saveSubmissions = (newSubmissions: StudentSubmission[]) => {
    setSubmissions(newSubmissions);
    try {
      localStorage.setItem('cbit_mar_submissions', JSON.stringify(newSubmissions));
    } catch (e) {}
  };

  const saveNotifications = (newNotifs: NotificationItem[]) => {
    setNotifications(newNotifs);
    try {
      localStorage.setItem('cbit_notifications', JSON.stringify(newNotifs));
    } catch (e) {}
  };

  const switchRole = (role: UserRole) => {
    // Prevent client-side role escalation in User Mode unless privileged maintainer/admin
    const isPrivilegedUser =
      currentUser.role === 'admin' ||
      currentUser.email?.toLowerCase() === 'cbit.spms.admin@gmail.com';

    const portalMode = typeof window !== 'undefined' ? localStorage.getItem('cbit_spms_portal_mode') : 'user';
    if (portalMode === 'user' && !isPrivilegedUser) {
      console.warn('[Security] Role switching is disabled in User Mode.');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('cbit_spms_portal_mode', 'test');
    }

    let targetUser = DEMO_USERS[role] || MOCK_CURRENT_USER;
    try {
      const savedCustomProfile = localStorage.getItem(`cbit_profile_${role}`);
      if (savedCustomProfile) {
        const parsed = JSON.parse(savedCustomProfile);
        if (parsed && parsed.role === role) {
          targetUser = { ...targetUser, ...parsed };
        }
      }
    } catch (e) {}

    persistActiveUser(sanitizeUserProfile(targetUser));
  };

  const updateUserAvatar = (avatarUrl: string) => {
    setCurrentUser((prev) => {
      const updated = sanitizeUserProfile({ ...prev, avatar_url: avatarUrl });
      try {
        localStorage.setItem('cbit_current_user', JSON.stringify(updated));
        localStorage.setItem(`cbit_profile_${prev.role}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    postSyncAction('update_avatar', {
      role: currentUser.role,
      avatarUrl,
      studentId: currentUser.id,
    });
  };

  const updateUserProfile = (data: Partial<UserProfile>) => {
    setCurrentUser((prev) => {
      const updated = sanitizeUserProfile({ ...prev, ...data });
      try {
        localStorage.setItem('cbit_current_user', JSON.stringify(updated));
        localStorage.setItem(`cbit_profile_${prev.role}`, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    postSyncAction('update_profile', {
      role: currentUser.role,
      profile: data,
    });
  };

  const updateSettings = (newSettings: Partial<SystemSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('cbit_mar_settings', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    postSyncAction('update_settings', newSettings);
  };

  const updateCategory = (updatedCat: ActivityCategory) => {
    setCategories((prev) => {
      const next = prev.map((c) => (c.id === updatedCat.id ? updatedCat : c));
      try {
        localStorage.setItem('cbit_mar_categories', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const addNotification = (item: Omit<NotificationItem, 'id' | 'created_at' | 'is_read'>) => {
    const newItem: NotificationItem = {
      ...item,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setNotifications((prev) => {
      const next = [newItem, ...prev];
      try {
        localStorage.setItem('cbit_notifications', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    postSyncAction('add_notification', newItem);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      try {
        localStorage.setItem('cbit_notifications', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    postSyncAction('mark_notification_read', { id });
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => {
      const next = prev.map((n) => {
        const isForMe = n.recipient_role === 'all' || n.recipient_role === currentUser.role || n.recipient_id === currentUser.id;
        return isForMe ? { ...n, is_read: true } : n;
      });
      try {
        localStorage.setItem('cbit_notifications', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    postSyncAction('mark_all_notifications_read', { role: currentUser.role, userId: currentUser.id });
  };

  const addSubmission = (newSub: Omit<StudentSubmission, 'id' | 'created_at' | 'status' | 'awarded_points'> & { status?: any }) => {
    // Generate valid UUID for PostgreSQL primary key
    const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });

    const fullSubmission: StudentSubmission = {
      ...newSub,
      id: generatedId,
      student_id: currentUser.id,
      student_name: currentUser.full_name,
      student_roll_no: currentUser.roll_number || '160124771129',
      student_email: currentUser.email || 'cbit.spms.admin@gmail.com',
      student_phone: currentUser.phone_number || undefined,
      student_section: currentUser.section || '2',
      mentor_id: currentUser.mentor_id || undefined,
      awarded_points: newSub.status === 'approved' ? newSub.claimed_points : 0,
      status: newSub.status || 'pending_mentor',
      messages: [],
      created_at: new Date().toISOString(),
    };
    const nextList = [fullSubmission, ...submissions];
    saveSubmissions(nextList);

    // Sync to server database
    postSyncAction('add_submission', fullSubmission);

    // Notify Mentor specifically
    addNotification({
      recipient_id: currentUser.mentor_id || undefined,
      recipient_role: 'mentor',
      type: 'submission',
      title: 'New Certificate Submitted',
      message: `${currentUser.full_name} submitted "${newSub.activity_title}" (${newSub.claimed_points} claimed pts).`,
      link: '/mentor',
      sender_name: currentUser.full_name,
    });
  };

  const updateSubmission = (id: string, updatedData: Partial<StudentSubmission>) => {
    let targetSub: StudentSubmission | undefined;
    const nextList = submissions.map((sub) => {
      if (sub.id === id) {
        targetSub = {
          ...sub,
          ...updatedData,
          updated_at: new Date().toISOString(),
        };
        return targetSub;
      }
      return sub;
    });
    saveSubmissions(nextList);

    postSyncAction('update_submission', { id, updatedData });

    // Notify Mentor that student updated the submission
    addNotification({
      recipient_id: targetSub?.mentor_id || currentUser.mentor_id || undefined,
      recipient_role: 'mentor',
      type: 'submission',
      title: 'Certificate Submission Updated',
      message: `${currentUser.full_name} updated submission "${updatedData.activity_title || targetSub?.activity_title || 'Certificate'}".`,
      link: '/mentor',
      sender_name: currentUser.full_name,
    });
  };

  const updateSubmissionStatus = (
    id: string,
    status: 'approved' | 'rejected' | 'needs_clarification',
    remarks?: string,
    awardedPoints?: number
  ) => {
    let targetSub: StudentSubmission | undefined;
    const nextList = submissions.map((sub) => {
      if (sub.id === id) {
        targetSub = {
          ...sub,
          status,
          mentor_remarks: remarks || sub.mentor_remarks,
          awarded_points: status === 'approved' ? Number(awardedPoints !== undefined && awardedPoints !== null ? awardedPoints : (sub.claimed_points || 0)) : 0,
          approved_by: currentUser.id,
          approver_name: currentUser.full_name,
          approved_at: status === 'approved' ? new Date().toISOString() : undefined,
          updated_at: new Date().toISOString(),
        };
        return targetSub;
      }
      return sub;
    });
    saveSubmissions(nextList);

    postSyncAction('update_submission_status', {
      id,
      status,
      remarks,
      awardedPoints: status === 'approved' ? Number(awardedPoints !== undefined && awardedPoints !== null ? awardedPoints : (targetSub?.claimed_points || 0)) : 0,
      approverName: currentUser.full_name,
      approverId: currentUser.id,
    });

    // Notify Student
    if (targetSub) {
      addNotification({
        recipient_id: targetSub.student_id,
        recipient_role: 'student',
        type: status === 'approved' ? 'approval' : status === 'rejected' ? 'rejection' : 'message',
        title: status === 'approved' ? `Certificate Approved (+${targetSub.awarded_points} Pts)` : status === 'rejected' ? `Certificate Rejected` : `Mentor Requested Clarification`,
        message: status === 'approved'
          ? `Your submission "${targetSub.activity_title}" was approved by ${currentUser.full_name}.`
          : status === 'rejected'
          ? `Your submission "${targetSub.activity_title}" was rejected: ${remarks || 'Please re-verify proof.'}`
          : `Faculty mentor ${currentUser.full_name} left a query on "${targetSub.activity_title}".`,
        link: '/student/history',
        sender_name: currentUser.full_name,
      });
    }
  };

  const bulkApproveSubmissions = (submissionIds: string[], remarks?: string) => {
    if (!submissionIds.length) return;

    const approvedAt = new Date().toISOString();
    const approvedSubs: StudentSubmission[] = [];

    const nextList = submissions.map((sub) => {
      if (submissionIds.includes(sub.id)) {
        const approvedSub: StudentSubmission = {
          ...sub,
          status: 'approved',
          mentor_remarks: remarks || 'Bulk verified & approved via AI Authenticity verification',
          awarded_points: sub.claimed_points || 0,
          approved_by: currentUser.id,
          approver_name: currentUser.full_name,
          approved_at: approvedAt,
          updated_at: approvedAt,
        };
        approvedSubs.push(approvedSub);
        return approvedSub;
      }
      return sub;
    });

    saveSubmissions(nextList);

    postSyncAction('bulk_approve_submissions', {
      ids: submissionIds,
      remarks,
      approverName: currentUser.full_name,
      approverId: currentUser.id,
    });

    // Send notifications to each affected student
    approvedSubs.forEach((sub) => {
      addNotification({
        recipient_id: sub.student_id,
        recipient_role: 'student',
        type: 'approval',
        title: `Certificate Bulk Approved (+${sub.awarded_points} Pts)`,
        message: `Your submission "${sub.activity_title}" was verified and approved by ${currentUser.full_name}.`,
        link: '/student/history',
        sender_name: currentUser.full_name,
      });
    });
  };

  const addSubmissionMessage = (submissionId: string, text: string) => {
    if (!text.trim()) return;

    const newMessage: SubmissionMessage = {
      id: `msg-${Date.now()}`,
      submission_id: submissionId,
      sender_id: currentUser.id,
      sender_name: currentUser.full_name,
      sender_role: currentUser.role,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };

    let targetSub: StudentSubmission | undefined;
    const nextList = submissions.map((sub) => {
      if (sub.id === submissionId) {
        targetSub = sub;
        return {
          ...sub,
          messages: [...(sub.messages || []), newMessage],
          updated_at: new Date().toISOString(),
        };
      }
      return sub;
    });
    saveSubmissions(nextList);

    postSyncAction('add_message', {
      submissionId,
      message: newMessage,
    });

    // Send high-priority notification to counterpart
    if (targetSub) {
      if (currentUser.role === 'mentor') {
        addNotification({
          recipient_id: targetSub.student_id,
          recipient_role: 'student',
          type: 'message',
          title: `Mentor Message: ${targetSub.activity_title}`,
          message: `${currentUser.full_name}: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`,
          link: '/student/history',
          sender_name: currentUser.full_name,
        });
      } else {
        addNotification({
          recipient_role: 'mentor',
          type: 'message',
          title: `Student Reply: ${targetSub.activity_title}`,
          message: `${currentUser.full_name}: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`,
          link: '/mentor',
          sender_name: currentUser.full_name,
        });
      }
    }
  };

  const revokeApprovedSubmission = (id: string, reason?: string) => {
    const targetSub = submissions.find((s) => s.id === id);
    if (!targetSub) return;

    const pointsDeducted = targetSub.awarded_points || targetSub.claimed_points || 0;
    const nextList = submissions.filter((s) => s.id !== id);
    saveSubmissions(nextList);

    postSyncAction('delete_submission', { id });

    // Send High-Priority Notification to the student
    addNotification({
      recipient_id: targetSub.student_id,
      recipient_role: 'student',
      type: 'rejection',
      title: `⚠️ Certificate Revoked & Deducted: "${targetSub.activity_title}" (-${pointsDeducted} Pts)`,
      message: `Faculty mentor ${currentUser.full_name} has revoked and deleted your certificate "${targetSub.activity_title}". Reason: ${reason || 'Identified as unverified or invalid proof'}. Please discuss this directly with your current faculty mentor during counseling hours.`,
      link: '/student/history',
      sender_name: currentUser.full_name,
    });
  };

  const getStudentAvatar = (studentId?: string): string | undefined => {
    // If querying the logged-in user
    if ((!studentId && currentUser.avatar_url) || (studentId === currentUser.id && currentUser.avatar_url)) {
      return currentUser.avatar_url;
    }

    // If querying student role or Shaik Saleem
    if (!studentId || studentId === 'usr-student-001') {
      if (currentUser.role === 'student' && currentUser.avatar_url) {
        return currentUser.avatar_url;
      }
      if (serverProfiles.student?.avatar_url) {
        return serverProfiles.student.avatar_url;
      }
      try {
        const savedStudent = localStorage.getItem('cbit_profile_student');
        if (savedStudent) {
          const parsed = JSON.parse(savedStudent);
          if (parsed.avatar_url) return parsed.avatar_url;
        }
      } catch (e) {}
    }

    // Check if any matching server profile exists
    if (studentId) {
      const matchProfile = Object.values(serverProfiles).find((p) => p.id === studentId);
      if (matchProfile?.avatar_url) return matchProfile.avatar_url;
    }

    const sub = submissions.find((s) => s.student_id === studentId && (s as any).student_avatar);
    if (sub && (sub as any).student_avatar) return (sub as any).student_avatar;

    return undefined;
  };

  const deleteSubmission = (id: string) => {
    const nextList = submissions.filter((s) => s.id !== id);
    saveSubmissions(nextList);
    postSyncAction('delete_submission', { id });
  };

  const resetToDefaults = () => {
    setSubmissions(MOCK_SUBMISSIONS);
    setCategories(CBIT_24_CATEGORIES);
    setSettings({
      id: 1,
      college_name: CBIT_COLLEGE_NAME,
      college_code: CBIT_COLLEGE_CODE,
      regular_target_points: DEFAULT_REGULAR_TARGET_POINTS,
      regular_max_points: DEFAULT_REGULAR_MAX_POINTS,
      lateral_entry_target_points: DEFAULT_LATERAL_ENTRY_TARGET_POINTS,
      lateral_entry_max_points: DEFAULT_LATERAL_ENTRY_MAX_POINTS,
      academic_year: "2025-2026",
    });
    localStorage.removeItem('cbit_mar_submissions');
    localStorage.removeItem('cbit_mar_categories');
    localStorage.removeItem('cbit_mar_settings');
    postSyncAction('reset_defaults', {});
  };

  // Filter unread notifications strictly relevant to current user
  const relevantNotifications = notifications.filter((n) => {
    // If a specific recipient_id is targeted, it MUST match the current user's ID
    if (n.recipient_id) {
      return n.recipient_id === currentUser.id;
    }
    // Otherwise check for role-wide announcement or broadcast to all
    if (n.recipient_role === 'all') return true;
    if (n.recipient_role === currentUser.role) return true;
    return false;
  });

  const unreadCount = relevantNotifications.filter((n) => !n.is_read).length;

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        switchRole,
        submissions,
        categories,
        settings,
        updateSettings,
        updateCategory,
        addSubmission,
        updateSubmission,
        updateSubmissionStatus,
        bulkApproveSubmissions,
        revokeApprovedSubmission,
        deleteSubmission,
        addSubmissionMessage,
        resetToDefaults,

        // Profile
        updateUserAvatar,
        updateUserProfile,
        getStudentAvatar,

        // Theme
        theme,
        toggleTheme,

        // Auth
        isAuthenticated,
        login,
        loginWithGoogle,
        register,
        logout,

        // Notifications
        notifications: relevantNotifications,
        unreadCount,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        addNotification,
      }}
    >
      {!isHydrated ? (
        <div className="min-h-screen bg-[#faf9f5] dark:bg-[#121214] flex items-center justify-center">
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 rounded-full border-3 border-[#385529]/20 border-t-[#385529] animate-spin" />
            <span className="text-xs font-serif font-bold text-[#385529] dark:text-emerald-400">
              Loading CBIT Student Portfolio...
            </span>
          </div>
        </div>
      ) : (
        children
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

