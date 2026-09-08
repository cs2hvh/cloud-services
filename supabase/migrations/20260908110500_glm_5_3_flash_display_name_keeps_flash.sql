-- Final wording for the self-served GLM's catalog name: vendor brand, model,
-- tier, and what makes it different. Applied live on 2026-09-08.
update inference.models
   set display_name = 'Z.AI / GLM 5.3 Flash Uncensored',
       description = 'GLM 5.3 Flash by Z.AI, uncensored, served on AhuraSense GPU pods.'
 where model_id = 'zhipu/glm-5.3-flash';
