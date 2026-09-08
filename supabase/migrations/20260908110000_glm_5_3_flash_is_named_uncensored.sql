-- The self-served GLM-5.3 Flash pods run the model without the vendor's
-- refusal tuning, and that is the product: the catalog name says so.
-- Applied to the live catalog by hand on 2026-09-08; recorded here so a
-- rebuild says the same.
update inference.models
   set display_name = 'GLM 5.3 Flash Uncensored',
       description = 'GLM-5.3 Flash, uncensored, served on AhuraSense GPU pods.'
 where model_id = 'zhipu/glm-5.3-flash';
