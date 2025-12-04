import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSchema1764846294076 implements MigrationInterface {
    name = 'CreateSchema1764846294076'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
        await queryRunner.query(`CREATE TABLE "locations" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coordinates" geometry(Point,4326) NOT NULL, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "jsonstorage" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" character varying NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_9edef5dd2b57675b6bd7baa65e4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "datasets" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" text NOT NULL, "name" text NOT NULL, "full_name" text, "version" text, "author" text, "description" text, "data_producer" text, "variables_measured" jsonb array, "spatial_resolution" text, "publication_date" date, "reference_period_start" text, "reference_period_stop" text, "licenses" uuid array NULL, "citation" text, "geographical_extent" text, "gis_datatype" text, "spatial_extent" geometry(Polygon,4326) NOT NULL, "n_observations" bigint, "n_raster_layers" integer, "soil_depth" jsonb, "status" text NOT NULL DEFAULT 'PENDING', "is_archived" boolean NOT NULL DEFAULT false, "created_by" text NOT NULL, "updated_by" text NULL, "service_location" text NULL, CONSTRAINT "UQ_8c3769423bf107f9ac88e5ab67d" UNIQUE ("slug"), CONSTRAINT "PK_1bf831e43c559a240303e23d038" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
        await queryRunner.query(`DROP TABLE "datasets"`);
        await queryRunner.query(`DROP TABLE "jsonstorage"`);
        await queryRunner.query(`DROP TABLE "locations"`);
    }

}
