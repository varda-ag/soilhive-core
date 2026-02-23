INSERT INTO soil_property_categories (category_name,category_acronym,description) VALUES
	 ('Chemical','chemp','Soil chemical properties represent the levels and availability of nutritional mineral elements for the plants, and other chemical parameters in connection with nutrient restoration or availability'),
	 ('Physical','phyp','Soil physical properties define movement of air, water and dissolved chemicals through soil, as well as conditions affecting germination, root growth, and erosion processes.'),
	 ('Biological','biop','Soil biological properties represent the direct and indirect influence of the living organisms in the soil environment.'),
	 ('Derived','derip','Derived soil properties are characteristics that are calculated or derived from primary soil properties.') 
on conflict(category_name) do nothing;