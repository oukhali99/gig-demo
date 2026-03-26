import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

const client = new SSMClient({});

function ssmConfigTtlSeconds(): number {
  const n = Number(process.env.SSM_CONFIG_TTL_SECONDS);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * When SSM_PARAMETER_PATH is set (Lambda), loads /{path}/* into process.env.
 * Local dev: omit SSM_PARAMETER_PATH and set env vars directly.
 *
 * Caching: first load per instance always fetches. After that, refetch only when
 * SSM_CONFIG_TTL_SECONDS > 0 and that many seconds have passed (so manual SSM edits
 * propagate without waiting for a new execution environment). TTL 0 = cache until
 * the instance is recycled.
 */
export async function ensureLambdaConfigFromSsm(): Promise<void> {
  const prefix = process.env.SSM_PARAMETER_PATH?.trim();
  if (!prefix) return;

  const ttlSec = ssmConfigTtlSeconds();
  const loaded = process.env._SSM_CONFIG_LOADED === '1';
  if (loaded) {
    if (ttlSec === 0) return;
    const loadedAt = Number(process.env._SSM_CONFIG_LOADED_AT);
    if (Number.isFinite(loadedAt) && Date.now() - loadedAt < ttlSec * 1000) return;
  }

  const path = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const parameters: { Name?: string; Value?: string }[] = [];
  let nextToken: string | undefined;
  do {
    const out = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: false,
        NextToken: nextToken,
        WithDecryption: false,
      })
    );
    parameters.push(...(out.Parameters ?? []));
    nextToken = out.NextToken;
  } while (nextToken);

  for (const p of parameters) {
    if (!p.Name || p.Value === undefined) continue;
    const segments = p.Name.split('/').filter(Boolean);
    const short = segments[segments.length - 1];
    if (short) process.env[short] = p.Value;
  }

  process.env._SSM_CONFIG_LOADED = '1';
  process.env._SSM_CONFIG_LOADED_AT = String(Date.now());
}
