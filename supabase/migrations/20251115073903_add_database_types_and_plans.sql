-- Create database_types table
CREATE TABLE IF NOT EXISTS database_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    versions JSONB NOT NULL DEFAULT '[]'::jsonb,
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert sample database types with versions
INSERT INTO database_types (code, name, description, icon_url, versions, available) VALUES
('mysql', 'MySQL', 'Popular open-source relational database', 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mysql/mysql-original.svg', '["8"]'::jsonb, true),
('pg', 'PostgreSQL', 'Advanced open-source database', 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg', '["14", "15", "16", "17"]'::jsonb, true),
('mongodb', 'MongoDB', 'NoSQL document database', 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/mongodb/mongodb-original.svg', '["7", "8"]'::jsonb, true),
('kafka', 'Apache Kafka', 'Distributed event streaming', '/kafka.png', '["3.8"]'::jsonb, true)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon_url = EXCLUDED.icon_url,
    versions = EXCLUDED.versions,
    available = EXCLUDED.available;

-- Insert sample database plans into products table (if they don't exist)
-- MySQL plans
INSERT INTO products (id, name, description, type, sub, resources, discount, price) VALUES
('db-mysql-starter', 'Starter', 'Entry-level MySQL database', 'database', 'mysql', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null, 15.00),
('db-mysql-basic', 'Basic', 'Basic MySQL database', 'database', 'mysql', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null, 35.00),
('db-mysql-professional', 'Professional', 'Professional MySQL database', 'database', 'mysql', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null, 75.00),
('db-mysql-business', 'Business', 'Business MySQL database', 'database', 'mysql', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null, 150.00)
ON CONFLICT (id) DO NOTHING;

-- PostgreSQL plans
INSERT INTO products (id, name, description, type, sub, resources, discount, price) VALUES
('db-pg-starter', 'Starter', 'Entry-level PostgreSQL database', 'database', 'pg', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null, 15.00),
('db-pg-basic', 'Basic', 'Basic PostgreSQL database', 'database', 'pg', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null, 35.00),
('db-pg-professional', 'Professional', 'Professional PostgreSQL database', 'database', 'pg', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null, 75.00),
('db-pg-business', 'Business', 'Business PostgreSQL database', 'database', 'pg', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null, 150.00)
ON CONFLICT (id) DO NOTHING;

-- MongoDB plans
INSERT INTO products (id, name, description, type, sub, resources, discount, price) VALUES
('db-mongodb-starter', 'Starter', 'Entry-level MongoDB database', 'database', 'mongodb', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null, 15.00),
('db-mongodb-basic', 'Basic', 'Basic MongoDB database', 'database', 'mongodb', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null, 35.00),
('db-mongodb-professional', 'Professional', 'Professional MongoDB database', 'database', 'mongodb', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null, 75.00),
('db-mongodb-business', 'Business', 'Business MongoDB database', 'database', 'mongodb', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null, 150.00)
ON CONFLICT (id) DO NOTHING;

-- Kafka plans
INSERT INTO products (id, name, description, type, sub, resources, discount, price) VALUES
('db-kafka-starter', 'Starter', 'Entry-level Kafka cluster', 'database', 'kafka', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null, 15.00),
('db-kafka-basic', 'Basic', 'Basic Kafka cluster', 'database', 'kafka', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null, 35.00),
('db-kafka-professional', 'Professional', 'Professional Kafka cluster', 'database', 'kafka', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null, 75.00),
('db-kafka-business', 'Business', 'Business Kafka cluster', 'database', 'kafka', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null, 150.00)
ON CONFLICT (id) DO NOTHING;
