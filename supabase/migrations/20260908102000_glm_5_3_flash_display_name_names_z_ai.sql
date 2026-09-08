-- The catalog name Harshit wants on the self-served GLM: the vendor's own
-- brand, Z.AI, in front. Applied to the live catalog by hand on 2026-09-08;
-- recorded here so a rebuild says the same. The id stays zhipu/glm-5.3-flash.
update inference.models
   set display_name = 'Z.AI / GLM 5.3 Uncensored',
       description = 'GLM 5.3 by Z.AI, uncensored, served on AhuraSense GPU pods.'
 where model_id = 'zhipu/glm-5.3-flash';
