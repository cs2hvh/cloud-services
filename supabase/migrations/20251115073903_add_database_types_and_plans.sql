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
-- Insert sample database plans into products table (if they don't exist).
-- products.id is UUID in baseline schema, so do not provide text IDs.
WITH plans(name, description, type, sub, resources, discount, price) AS (
    VALUES
    ('Starter', 'Entry-level MySQL database', 'database'::product_type, 'mysql', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null::numeric, 15.00::numeric),
    ('Basic', 'Basic MySQL database', 'database'::product_type, 'mysql', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null::numeric, 35.00::numeric),
    ('Professional', 'Professional MySQL database', 'database'::product_type, 'mysql', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null::numeric, 75.00::numeric),
    ('Business', 'Business MySQL database', 'database'::product_type, 'mysql', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null::numeric, 150.00::numeric),
    ('Starter', 'Entry-level PostgreSQL database', 'database'::product_type, 'pg', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null::numeric, 15.00::numeric),
    ('Basic', 'Basic PostgreSQL database', 'database'::product_type, 'pg', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null::numeric, 35.00::numeric),
    ('Professional', 'Professional PostgreSQL database', 'database'::product_type, 'pg', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null::numeric, 75.00::numeric),
    ('Business', 'Business PostgreSQL database', 'database'::product_type, 'pg', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null::numeric, 150.00::numeric),
    ('Starter', 'Entry-level MongoDB database', 'database'::product_type, 'mongodb', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null::numeric, 15.00::numeric),
    ('Basic', 'Basic MongoDB database', 'database'::product_type, 'mongodb', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null::numeric, 35.00::numeric),
    ('Professional', 'Professional MongoDB database', 'database'::product_type, 'mongodb', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null::numeric, 75.00::numeric),
    ('Business', 'Business MongoDB database', 'database'::product_type, 'mongodb', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null::numeric, 150.00::numeric),
    ('Starter', 'Entry-level Kafka cluster', 'database'::product_type, 'kafka', '{"cpu": 1, "ram": 1, "storage": 15}'::jsonb, null::numeric, 15.00::numeric),
    ('Basic', 'Basic Kafka cluster', 'database'::product_type, 'kafka', '{"cpu": 1, "ram": 2, "storage": 34}'::jsonb, null::numeric, 35.00::numeric),
    ('Professional', 'Professional Kafka cluster', 'database'::product_type, 'kafka', '{"cpu": 2, "ram": 4, "storage": 56}'::jsonb, null::numeric, 75.00::numeric),
    ('Business', 'Business Kafka cluster', 'database'::product_type, 'kafka', '{"cpu": 4, "ram": 8, "storage": 120}'::jsonb, null::numeric, 150.00::numeric)
)
INSERT INTO products (name, description, type, sub, resources, discount, price)
SELECT p.name, p.description, p.type, p.sub, p.resources, p.discount, p.price
FROM plans p
WHERE NOT EXISTS (
    SELECT 1
    FROM products existing
    WHERE existing.type = p.type
      AND existing.sub = p.sub
      AND existing.name = p.name
);
