-- Script to create functions to support ingestion process and data output to use as reference for the ingestion implementation in the backend
CREATE EXTENSION IF NOT EXISTS "unaccent";
create extension IF NOT EXISTS tablefunc;

CREATE OR REPLACE FUNCTION slugify(value TEXT)
RETURNS TEXT AS $$
-- removes accents (diacritic signs) from a given string --
  WITH unaccented AS (
    SELECT unaccent(value) AS value
  ),
-- lowercases the string
  lowercase AS (
    SELECT lower(value) AS value
    FROM unaccented
  ),
-- remove single and double quotes
  removed_quotes AS (
    SELECT regexp_replace(value, '[''"]+', '', 'gi') AS value
    FROM lowercase
  ),
-- replaces anything that's not a letter, number, hyphen('-'), or underscore('_') with a hyphen('-')
  hyphenated AS (
    SELECT regexp_replace(value, '[^a-z0-9\\-_]+', '-', 'gi') AS value
    FROM removed_quotes
  ),
-- trims hyphens('-') if they exist on the head or tail of the string
  trimmed AS (
    SELECT regexp_replace(regexp_replace(value, '\-+$', ''), '^\-', '') AS value
    FROM hyphenated
  )
  SELECT value FROM trimmed;
$$ LANGUAGE SQL STRICT IMMUTABLE;


CREATE OR REPLACE FUNCTION property_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(NEW.property_name);
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM soil_properties WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;
   
    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER property_slug
BEFORE INSERT OR update of property_name ON soil_properties
FOR EACH ROW EXECUTE PROCEDURE property_slug_generate_store_old();


CREATE OR REPLACE FUNCTION dataset_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(NEW.name);
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM datasets WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;

    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER dataset_slug
BEFORE INSERT OR update of name ON datasets
FOR EACH ROW EXECUTE PROCEDURE dataset_slug_generate_store_old();


CREATE OR REPLACE FUNCTION analytical_method_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(CONCAT(NEW.analytical_method, '-', NEW.analytical_tool, '-', NEW.limit_of_detection, '-', NEW.reference_standard));
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM analytical_methods WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;
   
    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER analytical_method_slug
BEFORE INSERT OR update ON analytical_methods
FOR EACH ROW EXECUTE PROCEDURE analytical_method_slug_generate_store_old();


CREATE OR REPLACE FUNCTION property_category_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(NEW.category_name);
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM soil_property_categories WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;
   
   
    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER property_category_slug
BEFORE INSERT OR update of category_name ON soil_property_categories
FOR EACH ROW EXECUTE PROCEDURE property_category_slug_generate_store_old();


CREATE OR REPLACE FUNCTION unit_conversion_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(CONCAT(NEW.original_unit_of_measurement, '-', NEW.standard_unit));
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM unit_conversions WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;
   
    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER unit_conversion_slug
BEFORE INSERT OR update ON unit_conversions
FOR EACH ROW EXECUTE PROCEDURE unit_conversion_slug_generate_store_old();



CREATE OR REPLACE FUNCTION license_slug_generate_store_old()
  RETURNS trigger 
as $$
  declare
  	lv_base_slug text;
    lv_new_slug TEXT;
    lv_counter INTEGER := 1;
  begin
	-- Generate the base slug
    lv_base_slug := slugify(NEW.name);
    lv_new_slug := lv_base_slug;

	-- Check if the slug already exists
    WHILE EXISTS (SELECT 1 FROM licenses WHERE slug = lv_new_slug) LOOP
	-- If it exists, append a number and increment
        lv_new_slug := lv_base_slug || '-' || lv_counter;
        lv_counter := lv_counter + 1;
    END LOOP;

    NEW.slug := lv_new_slug;
   
   
    insert into slug_history(entity_id, entity_type, slug) values (new.id, TG_TABLE_NAME, new.slug);
    RETURN NEW;
	end;
$$ LANGUAGE plpgsql;


CREATE TRIGGER license_slug
BEFORE INSERT OR update ON licenses
FOR EACH ROW EXECUTE PROCEDURE license_slug_generate_store_old();


CREATE OR REPLACE FUNCTION create_view()
 RETURNS trigger as $$
/*
 * Function that gets triggered on insert new row in datasets_mappings that (re)creates the harmonized data preview.
 * Takes data from the raw data table named as concat(regexp_replace(lower(({dataset.name})::text), '[^\w]+','_', 'g'), '_raw'). 
 * Creates the view as concat(regexp_replace(lower((({dataset.name})::text), '[^\w]+','_', 'g'), '_view').
 * Takes geometry column from any column containing 'geom' in the raw data, or else attempts to cteate it from a 'latitude' and 'longitude' column.
 * Takes metadata columns from datamapping (where the values are of type string), converting the name of the original columnsto the value.
 * Takes property columns from the datamapping where the values are of type object, applies conversion_formula if available and removes values below min_val and above max_val (if provided).
 * If "drop_records" key exists, removes record IDs contained in the integer array.
*/
declare
   	lv_file_view_name text;
   	lv_data_mapping jsonb;
   	var_r record;
   	var_m record;
   	lv_sql_view_filters text := '';
   	lv_sql_metadata_cols text := '';
   	lv_sql_properties_cleanup text := '';
   	lv_sql_geom_col text := '';
begin
	lv_file_view_name = concat('file_', new.file_id, '_preview');
	execute format('DROP VIEW IF EXISTS %I', lv_file_view_name);
	select data_mapping into lv_data_mapping from data_mappings where id=NEW.data_mapping_id;

    FOR var_r in (
		select col, p.property_acronym, (props->>'analytical_method_id') as analytical_method_id,
			(props->>'min_val')::numeric as min_val,
			(props->>'max_val')::numeric as max_val,
			trim('"' from uc.conversion_formula) as conversion_formula
		from jsonb_each(lv_data_mapping) as v(col, props)
		left join soil_properties p on (props->>'property_id')::uuid=p.id
		left join unit_conversions uc on (props->>'conversion_id')::uuid=uc.id
		where jsonb_typeof(props)='object')
    loop
	   begin
	    if var_r.min_val is not null and var_r.max_val is not null
	    then
	    	lv_sql_properties_cleanup = CONCAT(lv_sql_properties_cleanup, 'CASE WHEN (', replace(coalesce(var_r.conversion_formula, 'x'), 'x', CONCAT('(o.',var_r.col, ')::numeric')), ' BETWEEN ', var_r.min_val, ' AND ', var_r.max_val, ') THEN ', var_r.col, ' ELSE NULL END AS ', var_r.col, ',');
	    elsif var_r.min_val is not null
	    then
	    	lv_sql_properties_cleanup = CONCAT(lv_sql_properties_cleanup, 'CASE WHEN (', replace(coalesce(var_r.conversion_formula, 'x'), 'x', CONCAT('(o.',var_r.col, ')::numeric')), '>', var_r.min_val, ') THEN ', var_r.col, ' ELSE NULL END AS ', var_r.col, ',');
	    elsif var_r.max_val is not null
	    then
	    	lv_sql_properties_cleanup = CONCAT(lv_sql_properties_cleanup, 'CASE WHEN (', replace(coalesce(var_r.conversion_formula, 'x'), 'x', CONCAT('(o.',var_r.col, ')::numeric')), '<', var_r.max_val, ') THEN ', var_r.col, ' ELSE NULL END AS ', var_r.col, ',');
	    else
	    	lv_sql_properties_cleanup = CONCAT(lv_sql_properties_cleanup, replace(coalesce(var_r.conversion_formula, 'x'), 'x', CONCAT('(o.',var_r.col, ')::numeric')), ' AS ', var_r.col, ',');
	    end if;
	   end;
    end loop;
   
   	for var_m in (
		select col, mapped_col::text
		from jsonb_each(lv_data_mapping) as v(col, mapped_col)
		where jsonb_typeof(mapped_col)='string'
   	)
   	loop
	   	lv_sql_metadata_cols = CONCAT(lv_sql_metadata_cols, var_m.col, ' as ', var_m.mapped_col,', ');
   	end loop;
   
   if lv_data_mapping->'drop_records' is not null then
   	select 'WHERE record_id NOT IN ' || replace(replace((lv_data_mapping->>'drop_records')::text, ']', ')'), '[', '(')  into lv_sql_view_filters;
   end if;
  
  
	select column_name into lv_sql_geom_col from information_schema.columns where table_name=replace(lv_file_view_name, '_preview', '_raw') and column_name like '%geom%';
   if coalesce(lv_sql_geom_col::varchar(64),''::varchar(64)) = '' then
   	select 'ST_SetSRID(st_makepoint(longitude,latitude),4326) as geom' into lv_sql_geom_col;
   end if;

   	execute format('CREATE VIEW %I AS
		SELECT record_id, '|| lv_sql_metadata_cols || -- mapped metadata cols
		lv_sql_properties_cleanup || lv_sql_geom_col ||
		' FROM %I o ' || lv_sql_view_filters, lv_file_view_name, replace(lv_file_view_name, '_preview', '_raw'));

	RETURN NULL;
END;
$$
LANGUAGE plpgsql;
 
CREATE or replace TRIGGER sync_preview AFTER insert or UPDATE ON dataset_file_mappings
FOR EACH ROW 
when (new.file_id is not null)
EXECUTE FUNCTION create_view();


CREATE OR REPLACE FUNCTION create_template()
 RETURNS trigger as $$
/*
*/
declare
   	lv_template_name text;
   	lv_tbl_name text;
   	lv_prop_cols text;
begin
	lv_template_name = concat('/var/lib/postgresql/data/dataset_', new.dataset_id, '_template.csv');
	lv_tbl_name = concat('dataset_', new.dataset_id, '_mapping_', new.data_mapping_id, '_template');


	select string_agg(concat('"', col, '_', coalesce(uc.original_unit_of_measurement, p.standard_unit), '"', ' numeric'), ',  ') as sp_cols
	into lv_prop_cols
	from data_mappings dm, jsonb_each(dm.data_mapping) as v(col, props)
	left join soil_properties p on (props->>'property_id')::uuid=p.id
	left join unit_conversions uc on (props->>'conversion_id')::uuid=uc.id
	where dm.id=new.data_mapping_id and jsonb_typeof(props)='object';

	execute format('DROP TABLE IF EXISTS %I', lv_tbl_name);
	-- fixed columns: latitude, longitude, geom, horizon, license, max_depth, min_depth, sampling_date
	execute format('CREATE TABLE %I (latitude numeric, longitude numeric, geom geometry, horizon text, max_depth integer, min_depth integer, sampling_date date, %s)', lv_tbl_name, lv_prop_cols);

	raise notice '%', format('COPY %I TO %L WITH (FORMAT CSV, HEADER)', lv_tbl_name, lv_prop_cols, lv_template_name);
	execute format('COPY %I TO %L WITH (FORMAT CSV, HEADER)', lv_tbl_name, lv_template_name);
	execute format('DROP TABLE %I', lv_tbl_name);

	RETURN NULL;
END;
$$
LANGUAGE plpgsql;
 
CREATE or replace TRIGGER create_template_trg AFTER INSERT ON dataset_file_mappings
FOR EACH ROW 
when (new.file_id is null)
EXECUTE FUNCTION create_template();


CREATE OR REPLACE FUNCTION perform_ingestion(file_ids_in uuid[], dataset_id_in uuid, seqname text)
RETURNS void
LANGUAGE plpgsql 
as $$
/*
 * Function that triggers ingestion functions (insert_record()).
 * Once done, updates ingestion status and notifies ingestion completion in 'done_ingestions' channel.
*/
declare
	lv_file_view_name text;
	var_f uuid;
begin
	foreach var_f in array file_ids_in
	LOOP
		select concat('file_', var_f, '_preview') into lv_file_view_name;
		raise notice 'Executing ingestion for view %', lv_file_view_name;
		execute format('select insert_record(record_id, %L, %L, %L) from %I', var_f, dataset_id_in, seqname, lv_file_view_name);
		update files set ingested_at=now() where id=var_f;
	end loop;
   	PERFORM pg_notify('done_ingestions', seqname::text);
return;
end;
$$
;


CREATE OR REPLACE FUNCTION insert_record(record_id_in integer, file_id_in uuid, dataset_id_in uuid, seqname text)
 RETURNS record
 LANGUAGE plpgsql
AS $function$
/*
 * Function that populates the features, layers and observation tables (checking for duplicates in the two former) for each record of the cleaned dataset view, 
 * named as as concat(regexp_replace(lower((({dataset.name})::text), '[^\w]+','_', 'g'), '_view')
 * Takes the record_id and file_id. Handles progress updates through the ingestion sequence.
 * Maps the original property column names to the standardized property identifier for the observations and layer soil_properties list.
 * Returns record of the layer created.
*/
declare
	lv_dataset_id datasets.id%type;
    lv_raw_record  json;
	lv_file_view_name text;
    lv_feature_id  features.id%type;
   	lv_dataset_files_ids uuid[];
    lv_data_mapping_id data_mappings.id%type;
	lv_dataset_layer_id dataset_layers.id%type;
	lv_license_id licenses.id%type;
   	var_r record;
   	var_m record;
   	var_o record;
	soil_prop uuid;
   	lv_sql_metadata_mappings text := '';
   	lv_sql_metadata_cols text := '';
   	lv_sql_metadata_join_cols text := '';
   	lv_sql_observation_values text := '';
    lv_layer_id  layers.id%type;
    lv_observation_id  observations.id%type;
	lv_soil_properties uuid[];
   	lv_return_value record;
	lv_geometry geometry;
begin
	PERFORM nextval(seqname);
	
	lv_file_view_name = concat('file_', file_id_in, '_preview');
	
	select dm.id 
		into lv_data_mapping_id
		from dataset_file_mappings dfm
		left join data_mappings dm 
		on dfm.data_mapping_id=dm.id
		where dfm.file_id=file_id_in
		order by dm.created_at desc
		limit 1;


	EXECUTE format('SELECT row_to_json(o) FROM (select * from %I where record_id=$1) o', lv_file_view_name) into lv_raw_record using record_id_in;
	EXECUTE format('SELECT geom from %I where record_id=$1', lv_file_view_name) into lv_geometry using record_id_in;
 
    -- create new feature
	begin
        insert into features
            ( geom
            )
        values
            ( lv_geometry
            )
    	RETURNING id into lv_feature_id;
    exception when unique_violation then
        -- The caught exception means the record has been inserted already, so just select the feature_id again
        --raise notice 'concurrency conflict when creating feature on record_id=%', record_id_in;
        select  id
	    into    lv_feature_id
	    from    features f
	    where   f.geom = lv_geometry;
    end;
	
	--raise notice 'Created feature';
	-- check if license exists already
    execute 'select id
    from    licenses
    where   name=$1 or full_name=$1' into lv_license_id using lv_raw_record->>'license'::text;

    -- create new layer
    if (coalesce(lv_license_id::varchar(64),''::varchar(64)) = '' and lv_raw_record->>'license' is not null)
    then
    	begin
			execute 'insert into licenses (name)
				values ( $1
				) RETURNING id' into lv_license_id using lv_raw_record->>'license'::text;
	    exception when unique_violation then
	        --raise notice 'concurrency conflict when creating license on record_id=%', record_id_in;
		    execute 'select id
		    from    licenses
		    where   name=$1 or full_name=$1' into lv_license_id using lv_raw_record->>'license'::text;
	    end;
	  end if; 
	
	FOR var_r in (
		select col, jsonb_path_query(props, '$.property_id')->>0 as property_id, jsonb_path_query(props, '$.analytical_method_id')->>0 as analytical_method_id
		from data_mappings dm, jsonb_each(dm.data_mapping) as v(col, props)
		where dm.id=lv_data_mapping_id and jsonb_typeof(props)='object')
    loop
	   declare var_prop text;
	   begin
	    lv_sql_observation_values = CONCAT(lv_sql_observation_values, '(', quote_literal(var_r.col),', ' || CONCAT('t.',var_r.col) || '),');
	    if (lv_raw_record->>var_r.col)::numeric is not null
	    then
	    	select ARRAY_CAT(lv_soil_properties, array[var_r.property_id::uuid]) into lv_soil_properties;
	    end if;
	   end;
    end loop;
	
   	for var_m in (
   		select mc.col, mc.mapped_col, i.data_type as dtype
		from (select col, replace(mapped_col::text, '"', '') as mapped_col
				from data_mappings dm, jsonb_each(dm.data_mapping) as v(col, mapped_col)
				where dm.id=lv_data_mapping_id and jsonb_typeof(mapped_col)='string') mc
				left join information_schema.columns i on i.column_name=mc.mapped_col
				and i.table_name=lv_file_view_name
   	)
   	loop
	   	lv_sql_metadata_cols = CONCAT(lv_sql_metadata_cols, var_m.mapped_col,', ');
		if var_m.mapped_col='license' then
		   	lv_sql_metadata_mappings = CONCAT(lv_sql_metadata_mappings, quote_nullable(lv_license_id), '::uuid,');
		   	lv_sql_metadata_join_cols = CONCAT(lv_sql_metadata_join_cols, 'layers.', var_m.mapped_col,' = ', quote_nullable(lv_license_id) ,')::uuid and ');
			continue;
		end if;
	   	lv_sql_metadata_mappings = CONCAT(lv_sql_metadata_mappings, '($1->>', quote_literal(var_m.mapped_col),')::', var_m.dtype,',');
	   	lv_sql_metadata_join_cols = CONCAT(lv_sql_metadata_join_cols, 'layers.', var_m.mapped_col,' = ($1->>', quote_literal(var_m.mapped_col),')::', var_m.dtype, ' and ');
   	end loop;
	raise notice '%', lv_sql_metadata_cols;
   
	--raise notice 'Prepared metadata';

   	for var_o in execute format('SELECT col_value as value, property_id, analytical_method_id
			FROM %I t
			CROSS JOIN LATERAL (VALUES ' || left(lv_sql_observation_values, -1) || ') s(col_name, col_value)
			left join 
			(select col, jsonb_path_query(props, ''$.property_id'') as property_id, jsonb_path_query(props, ''$.analytical_method_id'') as analytical_method_id
			from data_mappings, jsonb_each(data_mappings.data_mapping) as v(col, props)
			where data_mappings.id=%L and jsonb_typeof(props)=''object'') pm
			on col_name=pm.col
			where t.record_id=$1', lv_file_view_name, lv_data_mapping_id) using record_id_in
   	loop
	   declare lv_observation_id uuid;
	   begin
		   if var_o.value is not null
			   then
				-- check if layer exists already
			    execute 'select id
			    from    layers
			    where   ' || left(lv_sql_metadata_join_cols, -4) into lv_layer_id using lv_raw_record;

			    -- create new layer
			    if coalesce(lv_layer_id::varchar(64),''::varchar(64)) = ''
			    then
			    	begin
						raise notice '%', 'insert into layers (' || left(lv_sql_metadata_cols, -2) || ')
							values ('|| left(lv_sql_metadata_mappings, -1) ||
							') RETURNING id';
						execute 'insert into layers (' || left(lv_sql_metadata_cols, -2) || ')
							values ('|| left(lv_sql_metadata_mappings, -1) ||
							') RETURNING id' into lv_layer_id using lv_raw_record;
				    exception when unique_violation then
				        --raise notice 'concurrency conflict when creating layer on record_id=%', record_id_in;
					    execute 'select id
						    from    layers
						    where   ' || left(lv_sql_metadata_join_cols, -4) into lv_layer_id using lv_raw_record;
				    end;
				  end if;
				--raise notice 'Created layer';
	
			    begin
					execute 'insert into dataset_layers(dataset_id, layer_id, feature_id, property_id)
						values ($1,
						$2,
						$3,
						$4) RETURNING id' into lv_dataset_layer_id using dataset_id_in, lv_layer_id, lv_feature_id, (var_o.property_id->>0)::uuid;
			    exception when unique_violation then
			        --raise notice 'concurrency conflict when creating layer on record_id=%', record_id_in;
				    execute 'select id
					    from    dataset_layers
					    where  dataset_id = $1 and layer_id = $2 and feature_id = $3 and property_id = $4' into lv_dataset_layer_id using dataset_id_in, lv_layer_id, lv_feature_id, (var_o.property_id->>0)::uuid;
			    end;

				--raise notice 'Created dataset-layer';

		   		-- check if observation exists already
			    execute 'select id
			    from    observations
			    where   dataset_layer_id = $1 and analytical_methodology_id = $2 and value= $3' into lv_observation_id using lv_dataset_layer_id, (var_o.analytical_method_id->>0)::uuid, var_o.value;
			   
			    -- create new observation
			    if coalesce(lv_observation_id::varchar(64),''::varchar(64)) = ''
			    then
			    	begin
						execute 'insert into observations(value, analytical_methodology_id, dataset_layer_id)
							values ($1,
							$2,
							$3) RETURNING id' into lv_observation_id using var_o.value, (var_o.analytical_method_id->>0)::uuid, lv_dataset_layer_id;
				    exception when unique_violation then
				        --raise notice 'concurrency conflict when creating observation on record_id=%', record_id_in;
					    execute 'select id
						    from    observations
						    where   dataset_layer_id = $2 and analytical_methodology_id = $4 and value=$5' into lv_observation_id using lv_dataset_layer_id, (var_o.analytical_method_id->>0)::uuid, var_o.value;
				    end;
				  end if;
				--raise notice 'Created observation';			
			end if;
		end;
		
   	end loop;
	-- raise notice 'Created observation';
	select *
	into lv_return_value
	from dataset_layers l 
	where l.layer_id=lv_layer_id and l.feature_id=lv_feature_id;
	-- TODO: return observations summary; (for v2)
    return lv_return_value;
end;
$function$
;

CREATE OR REPLACE FUNCTION update_dataset_metadata(dataset_id_in uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
/*
 * Function that updates dataset metadata (after ingestion) that can de inferred from the features, layers and observations tables.
 * Attempts to update: variables measured, licenses, n_observations, soil_depth, spatial_extent, reference_period_start, reference_period_stop, gis_datatype and status.
*/
begin
   update datasets set (variables_measured, licenses, n_observations, soil_depth, spatial_extent, reference_period_start, reference_period_stop, gis_datatype, status, updated_at)
 	= (
	 	select array_agg(distinct jsonb_strip_nulls(jsonb_build_object('soil_parameter', p.property_name, 'description', p.description, 'soil_parameter_code', p.property_acronym, 
	 		'unit_of_measurement', p.standard_unit, 'analytical_method', a.analytical_method, 'analytical_tool', a.analytical_tool, 'limit_of_detection', a.limit_of_detection, 'reference_standard', a.reference_standard))) as variables_measured, 
	 	array_agg(distinct l.license) as licenses, count(1) as n_observations, jsonb_build_object('min', min(l.min_depth), 'max', max(l.max_depth)) as soil_depth, 
	 	ST_Extent(f.geom) as spatial_extent, min(l.sampling_date) as reference_period_start, max(sampling_date) as reference_period_stop, string_agg(distinct ST_GeometryType(f.geom), ', ') as gis_datatype, 'INGESTED' as status, now() as updated_at
			from dataset_layers dl left join layers l 
			on l.id=dl.layer_id left join features f
			on f.id=dl.feature_id left join soil_properties p
			on p.id=dl.property_id left join observations o
			on dl.id=o.dataset_layer_id
			left join analytical_methods a
			on a.id=o.analytical_methodology_id
			where dl.dataset_id = dataset_id_in)
	where datasets.id=dataset_id_in;
end;
$function$
;

CREATE OR REPLACE FUNCTION create_data_output(area_of_interest text, dataset_list uuid[], soil_props_list uuid[] default null, dates daterange default null, horizons text[] default null, datatypes text[] default null, depths int4range default null)
 RETURNS refcursor
 LANGUAGE plpgsql
AS $function$
/*
 * Function that generates outputs for preview or bulk dowload based on input filter values. Takes area of interest as a geojson and a list of dataset IDs
 * Optionally, a list of soil property IDs, a daterange, a list of horizons, a list of datatypes and a range of depths. 
 * Returns a cursor for the output table with the following columns: geom, layer_id, dataset_name, license, sampling_date, min_depth, max_depth, horizon 
 * and one column per available soil property (or the requested soil soil_properties).
*/
declare
    lv_prop_colnames  text;
	lv_tbl_filters text := '';
    soil_props text[];
   	prop text;
    lv_tbl_query text;
    lv_prop_query text;
   	ref refcursor;
begin
	lv_tbl_filters := format(' where dl.dataset_id=ANY(%L::uuid[])', dataset_list);
	lv_tbl_filters := lv_tbl_filters || format(' and ST_Within(f.geom, ST_GeomFromGeoJSON(%L))', area_of_interest);
	
	if soil_props_list is not null 
	then
		lv_tbl_filters := lv_tbl_filters || format(' and dl.property_id=ANY(%L::uuid[])', soil_props_list);
	end if;
	
	if dates is not null 
	then
		lv_tbl_filters := lv_tbl_filters || format(' and l.sampling_date <@ %s', dates);
	end if;
	
	if horizons is not null 
	then
		lv_tbl_filters := lv_tbl_filters || format(' and l.horizon_code in (%s)', array_to_string(horizons, ','));
	end if;
	
	if datatypes is not null 
	then
		lv_tbl_filters := lv_tbl_filters || format(' and d.data_type in (%s)', array_to_string(datatypes, ','));
	end if;
	
	if depths is not null 
	then
		lv_tbl_filters := lv_tbl_filters || format(' and int4range(l.min_depth, l.max_depth) && %s', depths);
	end if;

	lv_prop_query := format('SELECT distinct concat(p.property_acronym, ''_'', o.analytical_methodology_id) as cat
		   from observations o
			left join dataset_layers dl
			on dl.id=o.dataset_layer_id
			left join properties p
			on dl.property_id=p.id
			left join layers l
			on l.id=dl.layer_id
			left join features f
			on dl.feature_id=f.id
			left join datasets d
			on dl.dataset_id=d.id %s order by 1', lv_tbl_filters);
	
	lv_tbl_query := format('select l.id, f.geom, d.name as dataset_name, l.license, l.sampling_date, l.min_depth, l.max_depth, l.horizon, concat(p.property_acronym, ''_'', o.analytical_methodology_id) as cat, o.value
		   from observations o
			left join dataset_layers dl
			on dl.id=o.dataset_layer_id
			left join properties p
			on dl.property_id=p.id
			left join layers l
			on l.id=dl.layer_id
			left join features f
			on dl.feature_id=f.id
			left join datasets d
			on dl.dataset_id=d.id %s order by 1', lv_tbl_filters);

	EXECUTE format('SELECT array_agg(cat)
		from (%s)', lv_prop_query) into soil_props;

	FOREACH prop IN ARRAY "soil_props" 
   	loop
	   	lv_prop_colnames = CONCAT(lv_prop_colnames, format('%I numeric, ', prop));
   	end loop;
	raise notice '%', format('SELECT *
			FROM crosstab(%L, %L) as (layer_id uuid, geom geometry, dataset_name text, license text, sampling_date date, min_depth int, max_depth int, horizon text, %s)', lv_tbl_query, lv_prop_query, left(lv_prop_colnames, -2));
	
    open ref for execute format('SELECT *
			FROM crosstab(%L, %L) as (layer_id uuid, geom geometry, dataset_name text, license text, sampling_date date, min_depth int, max_depth int, horizon text, %s)', lv_tbl_query, lv_prop_query, left(lv_prop_colnames, -2));
	return ref;
end;
$function$
;