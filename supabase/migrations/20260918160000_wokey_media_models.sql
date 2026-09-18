-- Image and video generation, served through the partner that carries them.
--
-- Eight models: three image, five video. All proxy-served, all partner-only;
-- the gateway's media routes never consult the second partner for these.
--
-- Pricing shape for media, already used by the (inactive) legacy rows:
--   image  {"cents_per_image": n,        "tiers": {"1K": n, "2K": n}}
--   video  {"cents_per_media_second": n, "tiers": {"480p": n, "720p": n, ...}}
-- The flat number is the default; "tiers" overrides it by size tier or
-- resolution. The usage consumer picks the tier from the request. Customer
-- prices below are placeholders at the vendor's own list price (the "Official"
-- column the partner quotes against), to be set from the admin panel;
-- upstream_pricing is what the partner charges us, per second, in cents, and
-- may be fractional.
--
-- Video capabilities carry the ranges the partner enforces; aspect ratios are
-- validated by the partner and its error is relayed, so none are listed here.

begin;

insert into inference.models
  (model_id, display_name, description, modality, serving_type, upstream_provider,
   upstream_model_id, capabilities, pricing, upstream_pricing, is_active, is_featured,
   sort_order, is_managed)
values
  ('openai/gpt-image-2.5', 'OpenAI / GPT Image 2.5',
   'Text and image to image. One image per request, returned as base64.',
   'image', 'proxy', 'wokey', 'gpt-image-2.5',
   '{"input_modalities":["text","image"],"output_modalities":["image"],"max_images":1,"response_formats":["b64_json"],"sizes":["1024x1024","1536x1024","1024x1536"],"size_tiers":{"1K":["1024x1024","1536x1024","1024x1536"]}}'::jsonb,
   '{"cents_per_image": 2, "tiers": {"1K": 2}}'::jsonb,
   '{"cents_per_image": 1, "tiers": {"1K": 1}}'::jsonb,
   true, false, 400, false),

  ('bytedance/jimeng-image-4.0', 'ByteDance / Jimeng Image 4.0',
   'Text to image at 2K and 4K. One image per request, returned as base64.',
   'image', 'proxy', 'wokey', 'jimeng-image-4.0',
   '{"input_modalities":["text"],"output_modalities":["image"],"max_images":1,"response_formats":["b64_json"],"sizes":["2048x2048","2304x1728","1728x2304","2560x1440","1440x2560","2496x1664","1664x2496","3024x1296","4096x4096","4693x3520","3520x4693","5404x3040","3040x5404","4992x3328","3328x4992","6197x2656"],"size_tiers":{"2K":["2048x2048","2304x1728","1728x2304","2560x1440","1440x2560","2496x1664","1664x2496","3024x1296"],"4K":["4096x4096","4693x3520","3520x4693","5404x3040","3040x5404","4992x3328","3328x4992","6197x2656"]}}'::jsonb,
   '{"cents_per_image": 2, "tiers": {"2K": 2, "4K": 2}}'::jsonb,
   '{"cents_per_image": 1, "tiers": {"2K": 1, "4K": 1}}'::jsonb,
   true, false, 401, false),

  ('x-ai/grok-imagine-image-2.0', 'xAI / Grok Imagine Image 2',
   'Text and image to image, up to 2K. One image per request, returned as base64.',
   'image', 'proxy', 'wokey', 'grok-imagine-image-2.0',
   '{"input_modalities":["text","image"],"output_modalities":["image"],"max_images":1,"max_input_images":3,"response_formats":["b64_json"],"sizes":["1024x1024","2048x2048","1536x1024","1024x1536","2048x1152","1152x2048"],"size_tiers":{"1K":["1024x1024"],"2K":["2048x2048","1536x1024","1024x1536","2048x1152","1152x2048"]}}'::jsonb,
   '{"cents_per_image": 2, "tiers": {"1K": 2, "2K": 2}}'::jsonb,
   '{"cents_per_image": 1, "tiers": {"1K": 1, "2K": 1}}'::jsonb,
   true, false, 402, false),

  ('bytedance/seedance-2.5', 'ByteDance / Seedance 2.5',
   'Text, image, video and audio to video, 4 to 30 seconds, 480p or 720p.',
   'video', 'proxy', 'wokey', 'jimeng-seedance-2.5',
   '{"async":true,"input_modalities":["text","image","video","audio"],"output_modalities":["video"],"modes":["text_to_video","multimodal_reference"],"duration_seconds":{"min":4,"max":30},"resolutions":["480p","720p"]}'::jsonb,
   '{"cents_per_media_second": 59, "tiers": {"480p": 27, "720p": 59}}'::jsonb,
   '{"cents_per_media_second": 26.55, "tiers": {"480p": 12.15, "720p": 26.55}}'::jsonb,
   true, false, 410, false),

  ('bytedance/seedance-2.0-mini', 'ByteDance / Seedance 2.0 Mini',
   'Text and image to video, 4 to 15 seconds, 720p. The economical tier.',
   'video', 'proxy', 'wokey', 'jimeng-seedance-2.0-mini',
   '{"async":true,"input_modalities":["text","image"],"output_modalities":["video"],"modes":["text_to_video"],"duration_seconds":{"min":4,"max":15},"resolutions":["720p"]}'::jsonb,
   '{"cents_per_media_second": 8, "tiers": {"720p": 8}}'::jsonb,
   '{"cents_per_media_second": 3.6, "tiers": {"720p": 3.6}}'::jsonb,
   true, false, 411, false),

  ('bytedance/seedance-2.0-fast-vip', 'ByteDance / Seedance 2.0 Fast',
   'Text and image to video, 4 to 15 seconds, 720p, tuned for turnaround.',
   'video', 'proxy', 'wokey', 'jimeng-seedance-2.0-fast-vip',
   '{"async":true,"input_modalities":["text","image"],"output_modalities":["video"],"modes":["text_to_video"],"duration_seconds":{"min":4,"max":15},"resolutions":["720p"]}'::jsonb,
   '{"cents_per_media_second": 12, "tiers": {"720p": 12}}'::jsonb,
   '{"cents_per_media_second": 5.4, "tiers": {"720p": 5.4}}'::jsonb,
   true, false, 412, false),

  ('bytedance/seedance-2.0-vip', 'ByteDance / Seedance 2.0',
   'Text and image to video, 4 to 15 seconds, 720p, 1080p or 4K.',
   'video', 'proxy', 'wokey', 'jimeng-seedance-2.0-vip',
   '{"async":true,"input_modalities":["text","image"],"output_modalities":["video"],"modes":["text_to_video"],"duration_seconds":{"min":4,"max":15},"resolutions":["720p","1080p","4K"]}'::jsonb,
   '{"cents_per_media_second": 78, "tiers": {"720p": 15, "1080p": 37, "4K": 78}}'::jsonb,
   '{"cents_per_media_second": 35.1, "tiers": {"720p": 6.75, "1080p": 16.65, "4K": 35.1}}'::jsonb,
   true, false, 413, false),

  ('x-ai/grok-imagine-video-1.5', 'xAI / Grok Imagine Video 1.5',
   'Text and image to video, 1 to 15 seconds, 480p to 1080p.',
   'video', 'proxy', 'wokey', 'grok-imagine-video-1.5',
   '{"async":true,"input_modalities":["text","image"],"output_modalities":["video"],"modes":["text_to_video"],"duration_seconds":{"min":1,"max":15},"resolutions":["480p","720p","1080p"]}'::jsonb,
   '{"cents_per_media_second": 25, "tiers": {"480p": 8, "720p": 14, "1080p": 25}}'::jsonb,
   '{"cents_per_media_second": 1.75, "tiers": {"480p": 0.56, "720p": 0.98, "1080p": 1.75}}'::jsonb,
   true, false, 414, false)
on conflict (model_id) do nothing;

commit;
