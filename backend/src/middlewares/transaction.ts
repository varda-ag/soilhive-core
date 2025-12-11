import { Request, Response, NextFunction } from 'express';
import { getDataSource } from '../utils/data-source';

export const transactionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const dataSource = await getDataSource();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  req.customData = req.customData || { entityManager: queryRunner.manager };

  let finished = false;

  const cleanup = async () => {
    if (finished) return; // ensure single execution
    finished = true;
    try {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        await queryRunner.commitTransaction();
      } else {
        await queryRunner.rollbackTransaction();
      }
    } catch {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  };

  res.on('finish', cleanup); // response completed successfully
  res.on('close', cleanup); // connection closed

  next();
};
