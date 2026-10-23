import { Request, Response } from 'express';
import PluginTokenService, { TooManyMintsError } from '../services/PluginTokenService';

const pluginTokenService = new PluginTokenService();

export const postPluginToken = (req: Request, res: Response): void => {
  const pluginId = req.params['pluginId']! as string;
  try {
    const data = pluginTokenService.mint(req.customData, pluginId);
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (err) {
    // The error middleware sends no headers of its own
    if (err instanceof TooManyMintsError) {
      res.set('Retry-After', String(err.retryAfterSeconds));
    }
    throw err;
  }
};
