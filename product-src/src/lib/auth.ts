import { Auth, CognitoHostedUIIdentityProvider } from '@aws-amplify/auth'
import { Amplify } from '@aws-amplify/core'

export function configureAmplify() {
  const env = import.meta.env
  const auth = {
    Auth: {
      region: env.VITE_AWS_REGION,
      userPoolId: env.VITE_AWS_USER_POOL_ID,
      userPoolWebClientId: env.VITE_AWS_USER_POOL_WEB_CLIENT_ID,
      authenticationFlowType: 'USER_PASSWORD_AUTH',
      oauth: {
        domain: env.VITE_AWS_COGNITO_DOMAIN,
        scope: ['openid', 'profile', 'email'],
        redirectSignIn: env.VITE_AWS_COGNITO_SIGNIN_REDIRECT,
        redirectSignOut: env.VITE_AWS_COGNITO_SIGNOUT_REDIRECT,
        responseType: 'code',
      },
    },
    Analytics: { disabled: true },
  }
  Amplify.configure(auth)
  Auth.configure(auth)
}

export const getAuthenticatedUser = () => Auth.currentAuthenticatedUser({ bypassCache: true })

export const signIn = (email: string, password: string) => Auth.signIn({ username: email, password })

export const signOut = () => Auth.signOut()

export const getJwtToken = async () => (await Auth.currentSession()).getIdToken().getJwtToken()

export async function handleGoogleSignIn() {
  await Auth.signOut({ global: true })
  await Auth.federatedSignIn({
    provider: CognitoHostedUIIdentityProvider.Google,
    customState: JSON.stringify({ prompt: 'select_account' }),
  })
}

/** Cognito wraps config errors in JSON; surface the readable part like the dashboard does. */
export function authErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Sign in failed'
  const match = raw.match(/CognitoAuthenticationConfigError: (.*?)(?:"|})/)
  return match ? match[1] : raw
}

export async function currentUserEmail(): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser()
    return user?.attributes?.email ?? user?.username ?? null
  } catch {
    return null
  }
}
