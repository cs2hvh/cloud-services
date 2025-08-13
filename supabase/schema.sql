-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create custom types
CREATE TYPE user_role AS ENUM ('member', 'admin', 'users', 'events', 'giveaways', 'application-forms', 'form-submissions');
CREATE TYPE product_type AS ENUM ('vps', 'vds', 'game', 'database');

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    default_project BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    users JSONB DEFAULT '[]'::jsonb
);

-- Project logs table
CREATE TABLE project_logs (
    id BIGSERIAL PRIMARY KEY,
    event TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE
);

-- User profiles table (extends Supabase auth.users)
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    avatar TEXT,
    display_name TEXT,
    steam TEXT,
    discord TEXT,
    background TEXT,
    bio TEXT,
    suspend BOOLEAN DEFAULT FALSE,
    roles user_role[] DEFAULT ARRAY['member']::user_role[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OTP verification table (for additional verification if needed)
CREATE TABLE otps (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT FALSE
);

-- Products table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    type product_type NOT NULL,
    sub TEXT,
    resources JSONB NOT NULL,
    discount DECIMAL(5,2),
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations table
CREATE TABLE locations (
    id BIGSERIAL PRIMARY KEY,
    short TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    available BOOLEAN DEFAULT TRUE
);

-- Game servers table
CREATE TABLE game_servers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    game_type TEXT NOT NULL,
    resources JSONB NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    node INTEGER NOT NULL,
    identifier TEXT NOT NULL,
    allocation INTEGER NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    plan UUID REFERENCES products(id),
    status TEXT DEFAULT 'active',
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    location_id BIGINT REFERENCES locations(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_servers ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view projects they are part of" ON projects
    FOR SELECT USING (
        auth.uid() = owner OR 
        auth.uid()::text = ANY(SELECT jsonb_array_elements_text(users))
    );

CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = owner);

CREATE POLICY "Project owners can update their projects" ON projects
    FOR UPDATE USING (auth.uid() = owner);

CREATE POLICY "Project owners can delete their projects" ON projects
    FOR DELETE USING (auth.uid() = owner);

-- Project logs policies
CREATE POLICY "Users can view logs for their projects" ON project_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_logs.project_id 
            AND (
                auth.uid() = projects.owner OR 
                auth.uid()::text = ANY(SELECT jsonb_array_elements_text(projects.users))
            )
        )
    );

CREATE POLICY "Users can insert logs for their projects" ON project_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects 
            WHERE projects.id = project_logs.project_id 
            AND (
                auth.uid() = projects.owner OR 
                auth.uid()::text = ANY(SELECT jsonb_array_elements_text(projects.users))
            )
        )
    );

-- User profiles policies
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Products policies (public read)
CREATE POLICY "Anyone can view products" ON products
    FOR SELECT USING (true);

-- Locations policies (public read)
CREATE POLICY "Anyone can view locations" ON locations
    FOR SELECT USING (true);

-- Game servers policies
CREATE POLICY "Users can view their own game servers" ON game_servers
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create game servers" ON game_servers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own game servers" ON game_servers
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own game servers" ON game_servers
    FOR DELETE USING (auth.uid() = user_id);

-- Functions and triggers

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, username, display_name)
    VALUES (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'display_name');
    RETURN new;
END;
$$ language plpgsql security definer;

-- Trigger to create user profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for user_profiles updated_at
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();