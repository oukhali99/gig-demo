import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;

export async function getUserBySub(sub: string): Promise<{ sub: string; email: string } | null> {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `sub = "${sub}"`,
      Limit: 1,
    })
  );
  const user = result.Users?.[0];
  if (!user) return null;
  const subAttr = user.Attributes?.find((a) => a.Name === 'sub');
  const emailAttr = user.Attributes?.find((a) => a.Name === 'email');
  const email = emailAttr?.Value ?? (user.Username as string) ?? '';
  const userId = subAttr?.Value ?? sub;
  return userId && email ? { sub: userId, email } : null;
}

export async function register(email: string, password: string): Promise<{ sub: string }> {
  const { UserSub } = await client.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }],
    })
  );
  if (!UserSub) throw new Error('SignUp did not return UserSub');
  await client.send(
    new AdminConfirmSignUpCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    })
  );
  return { sub: UserSub };
}

export async function login(email: string, password: string): Promise<{
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const result = await client.send(
    new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
  );
  const session = result.AuthenticationResult;
  if (!session?.IdToken || !session.AccessToken || !session.RefreshToken || session.ExpiresIn === undefined) {
    throw new Error('Invalid auth result');
  }
  return {
    idToken: session.IdToken,
    accessToken: session.AccessToken,
    refreshToken: session.RefreshToken,
    expiresIn: session.ExpiresIn,
  };
}

export async function refresh(refreshToken: string): Promise<{
  idToken: string;
  accessToken: string;
  expiresIn: number;
}> {
  const result = await client.send(
    new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    })
  );
  const session = result.AuthenticationResult;
  if (!session?.IdToken || !session.AccessToken || session.ExpiresIn === undefined) {
    throw new Error('Invalid refresh result');
  }
  return {
    idToken: session.IdToken,
    accessToken: session.AccessToken,
    expiresIn: session.ExpiresIn,
  };
}
