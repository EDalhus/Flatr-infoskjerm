// Innlogging mot Better Auth (/api/auth/*). Samme endepunkter på flatr.no og
// på kundens adresse; økt-cookien gjelder alle *.flatr.no.

async function call(path, body, method = 'POST') {
  const res = await fetch(`/api/auth${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(message(res.status, data)), { status: res.status, code: data?.code });
  return data;
}

/** Norske feilmeldinger for Better Auth-kodene vi viser til brukeren. */
function message(status, data) {
  if (status === 429) return 'For mange forsøk. Vent et minutt og prøv igjen.';
  const code = data?.code || '';
  const map = {
    INVALID_EMAIL_OR_PASSWORD: 'Feil e-post eller passord.',
    EMAIL_NOT_VERIFIED: 'Du må bekrefte e-postadressen først. Vi har sendt deg en ny lenke.',
    INVALID_CODE: 'Feil kode. Prøv igjen.',
    INVALID_TWO_FACTOR_COOKIE: 'Innloggingen gikk ut på tid. Start på nytt.',
    INVALID_PASSWORD: 'Feil passord.',
    PASSWORD_TOO_SHORT: 'Passordet må ha minst 10 tegn.',
    PASSWORD_TOO_LONG: 'Passordet er for langt.',
    INVALID_TOKEN: 'Lenken er utløpt eller allerede brukt. Be om en ny.',
    INVALID_BACKUP_CODE: 'Ugyldig reservekode.'
  };
  return map[code] || data?.message || 'Noe gikk galt. Prøv igjen.';
}

export const authClient = {
  /** -> { twoFactor: true } hvis det trengs kode, ellers innlogget. */
  signIn: async (email, password) => {
    // callbackURL: hvis e-posten ikke er bekreftet, sender Better Auth en ny lenke som ender her.
    const data = await call('/sign-in/email', { email, password, rememberMe: true, callbackURL: '/auth/welcome' });
    return { twoFactor: !!data?.twoFactorRedirect };
  },
  verifyTotp: (code, trustDevice = false) => call('/two-factor/verify-totp', { code, trustDevice }),
  verifyBackupCode: (code) => call('/two-factor/verify-backup-code', { code }),
  signOut: () => call('/sign-out', {}),
  session: () => call('/get-session', null, 'GET'),
  requestReset: (email) => call('/request-password-reset', { email, redirectTo: `${window.location.origin}/reset-password` }),
  resetPassword: (token, newPassword) => call('/reset-password', { token, newPassword }),
  changePassword: (currentPassword, newPassword) => call('/change-password', { currentPassword, newPassword, revokeOtherSessions: true }),
  updateName: (name) => call('/update-user', { name }),
  enableTwoFactor: (password) => call('/two-factor/enable', { password }),
  confirmTwoFactor: (code) => call('/two-factor/verify-totp', { code }),
  disableTwoFactor: (password) => call('/two-factor/disable', { password }),
  generateBackupCodes: (password) => call('/two-factor/generate-backup-codes', { password }),
  revokeOtherSessions: () => call('/revoke-other-sessions', {})
};
