import { Request, Response } from 'express';
import JobService from '../services/JobService';
import StatusCodes from 'http-status-codes';

const jobService = new JobService();

export const postJob = async (req: Request, res: Response) => {
  const data = await jobService.createJob(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const getJobs = async (req: Request, res: Response) => {
  const data = await jobService.getJobs(req.customData);
  res.json(data);
};

export const getJobById = async (req: Request, res: Response) => {
  const data = await jobService.getJobById(req.customData, req.params['jobId']!);
  res.json(data);
};

export const deleteJobById = async (req: Request, res: Response) => {
  await jobService.deleteJobById(req.customData, req.params['jobId']!);
  res.sendStatus(StatusCodes.NO_CONTENT);
};
