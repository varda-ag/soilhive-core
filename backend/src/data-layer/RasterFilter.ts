import { spawn } from 'child_process';

export default class RasterFilter {
  /**
   * @returns A map of dataset UUIDs to their overlap type with the provided geometry
   */
  addRasterFiles = async (files: string[], table: string): Promise<void> => {
    for (const file of files) {
      await new Promise<void>((resolve, reject) => {
        const raster2pgsql = spawn('raster2pgsql', [
          '-s', // SRID
          '4326',
          '-C', // Apply raster constraints -- srid, pixelsize etc. to ensure raster is properly registered in raster_columns view.
          '-x', // Disable setting the max extent constraint. Only applied if -C flag is also used.
          '-I', // Create a GiST index on the raster column.
          '-t', // Cut raster into tiles to be inserted one per table row
          '256x256',
          '-r', // Set the constraints (spatially unique and coverage tile) for regular blocking. Only applied if -C flag is also used.
          '-f', // Specify name of destination raster column, default is 'rast'
          '-a', // Append raster(s) to an existing table.
          file,
          `${process.env.POSTGRES_SCHEMA}.${table}`,
        ]);

        const psql = spawn('psql', [
          '-q',
          '-d',
          process.env.POSTGRES_DB!,
          '-h',
          process.env.POSTGRES_HOST!,
          '-U',
          process.env.POSTGRES_USER!,
        ]);
        raster2pgsql.stdout.pipe(psql.stdin);
        raster2pgsql.on('close', code => (code === 0 ? resolve() : reject(new Error('Load failed'))));
      });
    }
  };
}
