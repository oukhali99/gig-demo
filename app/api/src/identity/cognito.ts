import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  AuthFlowType,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;
const CLIENT_ID = process.env.CLIENT_ID!;

export async function getUserBySub(sub: string): Promise<{ sub: string; email: string; name?: string; bio?: string } | null> {
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
  const nameAttr = user.Attributes?.find((a) => a.Name === 'name');
  const bioAttr = user.Attributes?.find((a) => a.Name === 'custom:bio');
  const email = emailAttr?.Value ?? (user.Username as string) ?? '';
  const userId = subAttr?.Value ?? sub;
  if (!userId || !email) return null;
  const resultUser: { sub: string; email: string; name?: string; bio?: string } = {
    sub: userId,
    email,
  };
  if (nameAttr?.Value) resultUser.name = nameAttr.Value;
  if (bioAttr?.Value) resultUser.bio = bioAttr.Value;
  return resultUser;
}

export async function updateUserBySub(sub: string, options: { name?: string; bio?: string }): Promise<{ sub: string; email: string; name?: string; bio?: string } | null> {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `sub = "${sub}"`,
      Limit: 1,
    })
  );
  const user = result.Users?.[0];
  if (!user || !user.Username) return null;

  const attrUpdates = [] as { Name: string; Value: string }[];
  if (options.name !== undefined) attrUpdates.push({ Name: 'name', Value: options.name });
  if (options.bio !== undefined) attrUpdates.push({ Name: 'custom:bio', Value: options.bio });

  if (attrUpdates.length > 0) {
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.Username,
        UserAttributes: attrUpdates,
      })
    );
  }

  return getUserBySub(sub);
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
  if (process.env.ENVIRONMENT === 'dev') {
    await client.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
      })
    );
  }
  return { sub: UserSub };
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  await client.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    })
  );
}

export async function resendConfirmation(email: string): Promise<void> {
  await client.send(
    new ResendConfirmationCodeCommand({
      ClientId: CLIENT_ID,
      Username: email,
    })
  );
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
