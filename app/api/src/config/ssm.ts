import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

const client = new SSMClient({});

/**
 * When SSM_PARAMETER_PATH is set (Lambda), loads parameters from that path into process.env.
 * Called once per invocation (no cache). Local dev: omit SSM_PARAMETER_PATH and set env vars directly.
 */
export async function ensureLambdaConfigFromSsm(): Promise<void> {
  const prefix = process.env.SSM_PARAMETER_PATH?.trim();
  if (!prefix) return;

  const path = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const parameters: { Name?: string; Value?: string }[] = [];
  let nextToken: string | undefined;
  do {
    const out = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        Recursive: false,
        NextToken: nextToken,
        WithDecryption: true,
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
}
