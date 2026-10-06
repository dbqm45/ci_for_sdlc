import { describe, expect, it } from 'vitest';
import { awsCredentialsConfigured } from '../src/app.js';

// Source: AWS SDK default credential chain (env, shared config/SSO, web identity, container credentials).
describe('AWS credentials status for the Bedrock provider', () => {
  it.each([
    { id: 'access keys', env: { AWS_ACCESS_KEY_ID: 'AKIA…' } },
    { id: 'shared profile / SSO', env: { AWS_PROFILE: 'dev' } },
    { id: 'Bedrock API key', env: { AWS_BEARER_TOKEN_BEDROCK: 'token' } },
    { id: 'EKS IRSA (web identity)', env: { AWS_WEB_IDENTITY_TOKEN_FILE: '/var/run/secrets/token', AWS_ROLE_ARN: 'arn:aws:iam::1:role/r' } },
    { id: 'ECS / Fargate / App Runner task role', env: { AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: '/v2/credentials/x' } },
    { id: 'EKS Pod Identity', env: { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'http://169.254.170.23/v1/credentials' } },
  ])('$id → configured', ({ env }) => {
    expect(awsCredentialsConfigured(env)).toBe(true);
  });

  it.each([
    { id: 'nothing set', env: {} },
    { id: 'empty values', env: { AWS_ACCESS_KEY_ID: '', AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: '' } },
    { id: 'region alone', env: { AWS_REGION: 'eu-central-1' } },
  ])('$id → missing', ({ env }) => {
    expect(awsCredentialsConfigured(env)).toBe(false);
  });
});
