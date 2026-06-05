CREATE TABLE {{table}} (
	record_id int4 PRIMARY KEY,
	longitude float8 NULL,
	latitude float8 NULL,
	profile_id int4 NULL,
	layer_id int4 NULL,
	profile_code varchar NULL,
	layer_name varchar NULL,
	upper_depth int4 NULL,
	lower_depth int4 NULL,
	"date" date NULL,
	licence varchar NULL,
	bdfi33 float8 NULL,
	bdfiod float8 NULL,
	depthrange text NULL,
	min_depth2 int4 NULL,
	max_depth2 int4 NULL,
	geometry public.geometry(point, 4326) NULL
);
INSERT INTO {{table}} (record_id,longitude,latitude,profile_id,layer_id,profile_code,layer_name,upper_depth,lower_depth,"date",licence,bdfi33,bdfiod,depthrange,min_depth2,max_depth2,geometry)
SELECT v.*
FROM (VALUES
	 (10001,-148.043243399999,64.814888,1055899,633132,'04N0971',NULL,10,15,'2004-07-16'::date,'test_license_raw_data',0.42333335,0.38,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.043243399999 64.814888)'::public.geometry),
	 (10002,-148.043243399999,64.814888,1055899,633133,'04N0971','Bgjj1',15,29,'2004-07-16'::date,'test_license_raw_data',1.3233334,1.22,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.043243399999 64.814888)'::public.geometry),
	 (10003,-148.043243399999,64.814888,1055899,633134,'04N0971','Bgjj2',29,42,'2004-07-16'::date,'test_license_raw_data',1.365,1.255,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.043243399999 64.814888)'::public.geometry),
	 (10085,-148.011993408203,64.9757995605469,1107250,3134562,'MDU_5',NULL,0,3,'2001-08-01'::date,'test_license_raw_data',-999,0.04,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10086,-148.011993408203,64.9757995605469,1107250,3134563,'MDU_5',NULL,3,15,'2001-08-01'::date,'test_license_raw_data',0,0.06,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10087,-148.011993408203,64.9757995605469,1107250,3134564,'MDU_5',NULL,15,20,'2001-08-01'::date,'test_license_raw_data',-999,0.43,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10088,-148.011993408203,64.9757995605469,1107250,3134565,'MDU_5',NULL,20,25,'2001-08-01'::date,'test_license_raw_data',-2,1.1,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10089,-148.011993408203,64.9757995605469,1107287,3134745,'MDU_3',NULL,0,15,'2001-08-01'::date,'test_license_raw_data',-3,0.08,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10090,-148.011993408203,64.9757995605469,1107287,3134746,'MDU_3',NULL,15,18,'2001-08-01'::date,'test_license_raw_data',NULL,0.41,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10091,-148.011993408203,64.9757995605469,1107287,3134747,'MDU_3',NULL,18,23,'2001-08-01'::date,'test_license_raw_data',NULL,0.81,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10096,-148.011993408203,64.9757995605469,1109669,3145590,'MDU_1',NULL,0,16,'2001-08-01'::date,'test_license_raw_data',NULL,0.11,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10097,-148.011993408203,64.9757995605469,1109669,3145591,'MDU_1',NULL,16,18,'2001-08-01'::date,'test_license_raw_data',NULL,0.36,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10098,-148.011993408203,64.9757995605469,1109669,3145592,'MDU_1',NULL,18,23,'2001-08-01'::date,'test_license_raw_data',NULL,0.88,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10099,-148.011993408203,64.9757995605469,1109679,3145635,'MDU_4',NULL,0,3,'2001-08-01'::date,'test_license_raw_data',NULL,0.03,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10100,-148.011993408203,64.9757995605469,1109679,3145636,'MDU_4',NULL,3,9,'2001-08-01'::date,'test_license_raw_data',NULL,0.07,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10101,-148.011993408203,64.9757995605469,1109679,3145637,'MDU_4',NULL,9,11,'2001-08-01'::date,'test_license_raw_data',NULL,0.39,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10102,-148.011993408203,64.9757995605469,1109679,3145638,'MDU_4',NULL,11,16,'2001-08-01'::date,'test_license_raw_data',NULL,0.92,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10136,-148.011993408203,64.9757995605469,1112775,3158438,'MDU_2',NULL,3,16,'2001-08-01'::date,'test_license_raw_data',NULL,0.08,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 (10137,-148.011993408203,64.9757995605469,1112775,3158439,'MDU_2',NULL,16,19,'2001-08-01'::date,'test_license_raw_data',NULL,0.38,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry),
	 -- record_id 10050 is intentionally inserted last despite having a lower id than the other
	 -- upper_depth=0 rows (10085, 10089, 10096, 10099). Being last in the heap means PostgreSQL's
	 -- sort places it after those rows for equal upper_depth values, so without a secondary ORDER BY
	 -- on record_id the cursor skips it entirely. This is the regression fixture for SP-5261.
	 (10050,-148.011993408203,64.9757995605469,9999999,9999000,'TEST_SORT',NULL,0,5,'2001-08-01'::date,'test_license_raw_data',NULL,0.50,'100-200 cm', -15, -5,'SRID=4326;POINT (-148.011993408203 64.9757995605469)'::public.geometry))
	as v(record_id,longitude,latitude,profile_id,layer_id,profile_code,layer_name,upper_depth,lower_depth,"date",licence,bdfi33,bdfiod,geometry)
LIMIT {{limit}};
