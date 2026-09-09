-- The hosted Qwen is the uncensored build, and both the id and the name
-- say so, as the hosted GLM's do. The endpoint row follows through the
-- ON UPDATE CASCADE foreign key. Applied live 2026-09-09.
update inference.models
   set model_id = 'qwen/qwen3.8-flash-next-uncensored',
       display_name = 'Qwen / Qwen3.8 Flash Next Uncensored',
       description = 'Qwen3.8 Flash Next, uncensored, served on AhuraSense GPU pods.'
 where model_id = 'qwen/qwen3.8-flash-next';
