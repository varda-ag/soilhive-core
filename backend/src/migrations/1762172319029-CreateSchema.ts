import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateSchema1762172319029 implements MigrationInterface {
    name = 'CreateSchema1762172319029'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "soilhive"."locations" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "coordinates" geometry(Point,4326) NOT NULL, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "soilhive"."jsonstorage" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "id" character varying NOT NULL, "data" jsonb NOT NULL, CONSTRAINT "PK_9edef5dd2b57675b6bd7baa65e4" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "soilhive"."jsonstorage"`);
        await queryRunner.query(`DROP TABLE "soilhive"."locations"`);
    }

}
