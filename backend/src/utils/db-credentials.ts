import { Signer } from '@aws-sdk/rds-signer';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { readFileSync } from 'fs';
import assert from 'assert';
import path from 'path';

let cachedToken = '';
let tokenExpiry = 0;

const getAuthToken = async () => {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  const signer = new Signer({
    region: process.env.POSTGRES_AWS_REGION!,
    hostname: process.env.POSTGRES_HOST!,
    port: Number(process.env.POSTGRES_PORT),
    username: process.env.POSTGRES_USER!,
    credentials: fromNodeProviderChain(), // Automatically uses IAM role
  });

  cachedToken = await signer.getAuthToken();
  tokenExpiry = now + 14 * 60 * 1000; // Refresh before 15min expiry
  return cachedToken;
};

const validateEnvironmentVariables = () => {
  for (const v of ['HOST', 'PORT', 'DB', 'USER', 'SCHEMA']) {
    const name = `POSTGRES_${v}`;
    assert(process.env[name], `Missing environment variable: ${name}`);
  }
  assert(
    process.env.POSTGRES_PASSWORD || process.env.POSTGRES_AWS_REGION,
    'Either POSTGRES_PASSWORD or POSTGRES_AWS_REGION must be specified',
  );
};

export const getDBPassword = async () => {
  validateEnvironmentVariables();
  return process.env.POSTGRES_PASSWORD ?? getAuthToken();
};

// Certificate downloaded from: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
export const SSL_ROOT_CERT_PATH = path.join(__dirname, '..', 'assets', 'global-bundle.pem');

export const getSSL = () => {
  return { ca: readFileSync(SSL_ROOT_CERT_PATH, 'utf8') };
};
