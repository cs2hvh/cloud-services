ALTER TABLE public.clusters
ADD COLUMN IF NOT EXISTS create_droplet boolean DEFAULT false;
