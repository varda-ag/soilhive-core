import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterFilters1772037278604 implements MigrationInterface {
  name = 'RasterFilters1772037278604';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TABLE "raster_filters" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL, "mappings" jsonb, CONSTRAINT "PK_raster_filters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "raster_filters" (id,name,description) VALUES ('land_cover','Land cover','The Copernicus Global Land Service (CGLS) provides a series of biogeophysical products (i.e. Leaf Area Index, Land Surface Temperature, soil moisture, etc.) on the status and evolution of land surface at global scale.');`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE "raster_filters"`);
  }
}
