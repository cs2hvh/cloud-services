-- Ensure every user always has at least one project by auto-creating
-- a default project at signup and backfilling existing users with none.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, username, display_name)
    VALUES (
        new.id,
        COALESCE(
            NULLIF(new.raw_user_meta_data->>'username', ''),
            split_part(COALESCE(new.email, ''), '@', 1)
        ),
        COALESCE(
            NULLIF(new.raw_user_meta_data->>'display_name', ''),
            NULLIF(new.raw_user_meta_data->>'username', ''),
            split_part(COALESCE(new.email, ''), '@', 1)
        )
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.projects (name, description, default_project, owner, users)
    SELECT
        'My First Project',
        'Default project created automatically.',
        TRUE,
        new.id,
        jsonb_build_array(new.id::text)
    WHERE NOT EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.owner = new.id
    );

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.projects (name, description, default_project, owner, users)
SELECT
    'My First Project',
    'Default project created automatically.',
    TRUE,
    u.id,
    jsonb_build_array(u.id::text)
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.owner = u.id
);
