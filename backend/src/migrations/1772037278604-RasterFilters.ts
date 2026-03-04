import { MigrationInterface, QueryRunner } from 'typeorm';

export class RasterFilters1772037278604 implements MigrationInterface {
  name = 'RasterFilters1772037278604';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(
      `CREATE TABLE "raster_filters" ("created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP, "id" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL, "mappings" jsonb, CONSTRAINT "PK_raster_filters_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `
      INSERT INTO "raster_filters" (id,name,description) VALUES ('land_cover','Land cover','The Copernicus Global Land Service (CGLS) provides a series of biogeophysical products (i.e. Leaf Area Index, Land Surface Temperature, soil moisture, etc.) on the status and evolution of land surface at global scale.');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('agroecological_zones', 'Agroecological zones', 'The Food and Agriculture Organization of the United Nations (FAO) and the International Institute for Applied Systems Analysis (IIASA) have cooperated over several decades to develop and implement the Agro-Ecological Zones (AEZ) modeling framework and databases. AEZ relies on well-established land evaluation principles to assess natural resources for finding suitable agricultural land utilization options. Compilation of an AEZ agro-climatic inventory using several climatic variables (e.g. temperature, precipitation, sunshine fraction, relative humidity) gives a <strong>general characterization of climatic resources, signifies their suitability for agricultural use and provides data and indicators related to climatic requirements of crop growth, development and yield formation. Source: © FAO, 2021. Global Agro-Ecological Zones v4');
      INSERT INTO "raster_filters" (id,name,description) VALUES ('soil_groups', 'Soil Groups', 'This filter refers to the categories defined by the WRB, an international soil classification system developed by the IUSS. These groups classify soils based on their physical and chemical properties, providing a standardized framework for naming soils and creating legends for soil maps. FAO & IIASA. 2023. Harmonized World Soil Database version 2.0. Rome and Laxenburg.');
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET search_path TO ${process.env.POSTGRES_SCHEMA}, public`);
    await queryRunner.query(`DROP TABLE "raster_filters"`);
  }
}
