-- ==============================================================================
-- CBIT SPMS — Staging Student Account Seed
-- Description: Adds Shaik Saleem's student account exclusively in the STAGING database.
-- Run this once in your STAGING Supabase SQL Editor.
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID;
    v_mentor_id UUID;
    v_email TEXT := 'saleemshaik2005@gmail.com';
BEGIN
    -- 1. Resolve Staging Mentor ID (Dr. Test Mentor One or any available mentor)
    SELECT id INTO v_mentor_id 
    FROM public.profiles 
    WHERE email = 'staging.mentor1@cbit.ac.in'
    LIMIT 1;

    IF v_mentor_id IS NULL THEN
        SELECT id INTO v_mentor_id FROM public.profiles WHERE role = 'mentor' LIMIT 1;
    END IF;

    -- 2. Lookup existing Auth user or generate a dedicated ID
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE lower(email) = lower(v_email)
    LIMIT 1;

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            '',
            NOW(),
            '{"provider":"google","providers":["google"]}'::jsonb,
            '{"full_name":"SHAIK SALEEM","roll_number":"160124771129","role":"student"}'::jsonb,
            NOW(),
            NOW()
        );
    END IF;

    -- 3. Upsert student record in public.profiles (safely handle existing email or ID)
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(v_email)) THEN
        UPDATE public.profiles
        SET
            id = v_user_id,
            email = v_email,
            full_name = 'SHAIK SALEEM',
            role = 'student',
            roll_number = '160124771129',
            department = 'Artificial Intelligence and Data Science (AI&DS)',
            section = '2',
            batch_year = '2024-2028 (5th Semester)',
            is_lateral_entry = FALSE,
            mentor_id = COALESCE(v_mentor_id, mentor_id),
            login_method = 'google',
            must_change_password = FALSE,
            is_active = TRUE,
            skills = ARRAY['Python', 'TensorFlow', 'React', 'Next.js', 'AI OCR', 'SQL'],
            github_url = 'https://github.com/saleemshaik2005',
            linkedin_url = 'https://linkedin.com/in/saleemshaik',
            updated_at = NOW()
        WHERE lower(email) = lower(v_email);
    ELSE
        INSERT INTO public.profiles (
            id,
            email,
            full_name,
            role,
            roll_number,
            department,
            section,
            batch_year,
            is_lateral_entry,
            mentor_id,
            login_method,
            must_change_password,
            is_active,
            skills,
            github_url,
            linkedin_url,
            updated_at
        ) VALUES (
            v_user_id,
            v_email,
            'SHAIK SALEEM',
            'student',
            '160124771129',
            'Artificial Intelligence and Data Science (AI&DS)',
            '2',
            '2024-2028 (5th Semester)',
            FALSE,
            v_mentor_id,
            'google',
            FALSE,
            TRUE,
            ARRAY['Python', 'TensorFlow', 'React', 'Next.js', 'AI OCR', 'SQL'],
            'https://github.com/saleemshaik2005',
            'https://linkedin.com/in/saleemshaik',
            NOW()
        );
    END IF;

    RAISE NOTICE 'Staging student account successfully provisioned for % (UUID: %)', v_email, v_user_id;
END $$;

-- 4. Ensure Authenticated users can view profiles under RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Authenticated users can view profiles'
    ) THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Authenticated users can view profiles" 
            ON public.profiles FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
