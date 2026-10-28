// Kontoer og innlogging med Better Auth (åpen kildekode, kjører her i
// serveren, data i platform.db). Better Auth eier passord, økter, e-post-
// bekreftelse, «glemt passord», tofaktor (TOTP) og beskyttelse mot gjetting.
// Flatr eier organisasjonene (tenants) og medlemskapene (memberships/users),
// koblet til Better Auth-brukeren via e-postadressen.
//
// Økt-cookien gjelder for hoveddomenet og alle *.flatr.no, så én innlogging
// gir tilgang til alle organisasjonene man er medlem av.
//
//   /api/auth/*  – Better Auth sine egne endepunkter (sign-in/email, sign-out,
//                  request-password-reset, reset-password, two-factor/*, …)

import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { getMigrations } from 'better-auth/db/migration';
import { platformDb, upsertUser, normEmail } from './platform.js';
import { sendMail, buttonMail } from './mail.js';

const PROTOCOL = process.env.PUBLIC_PROTOCOL || 'http';
const BASE_DOMAIN = (process.env.BASE_DOMAIN || 'localhost:8787').toLowerCase();
const BASE_HOST = BASE_DOMAIN.split(':')[0];
const ORIGIN = `${PROTOCOL}://${BASE_DOMAIN}`;

// Hooks som resten av serveren kobler seg på (unngår sirkulære importer).
const hooks = { afterEmailVerification: null };
export const onEmailVerified = (fn) => (hooks.afterEmailVerification = fn);

const options = {
  appName: 'Flatr',
  baseURL: ORIGIN,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  database: platformDb.db,
  trustedOrigins: [ORIGIN, `${PROTOCOL}://*.${BASE_DOMAIN}`],

  // Egne tabellnavn, så de ikke blandes med Flatrs users/sessions.
  user: { modelName: 'auth_user' },
  session: { modelName: 'auth_session', expiresIn: 30 * 24 * 3600, updateAge: 24 * 3600 },
  account: { modelName: 'auth_account' },
  verification: { modelName: 'auth_verification' },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 3600,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Sett nytt passord – Flatr',
        ...buttonMail({
          heading: 'Sett nytt passord',
          intro: 'Klikk på knappen for å velge et nytt passord. Lenken virker i én time.',
          button: 'Velg passord',
          url,
          outro: 'Har du ikke bedt om dette, kan du se bort fra e-posten. Passordet ditt er uendret.'
        })
      });
    }
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true, // forsøker man å logge inn ubekreftet, kommer en ny lenke
    autoSignInAfterVerification: true,
    expiresIn: 24 * 3600,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: 'Bekreft e-postadressen din – Flatr',
        ...buttonMail({
          heading: 'Bekreft e-postadressen din',
          intro: 'Klikk på knappen for å bekrefte adressen og ta i bruk Flatr. Lenken virker i 24 timer.',
          button: 'Bekreft e-post',
          url,
          outro: 'Har du ikke opprettet en Flatr-konto, kan du se bort fra e-posten.'
        })
      });
    },
    afterEmailVerification: async (user) => hooks.afterEmailVerification?.(user)
  },

  // Beskyttelse mot gjetting: få forsøk per IP og minutt på innlogging og koder.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 3600, max: 10 },
      '/request-password-reset': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
      '/two-factor/verify-totp': { window: 60, max: 5 },
      '/two-factor/verify-backup-code': { window: 60, max: 5 }
    }
  },

  advanced: {
    cookiePrefix: 'flatr',
    useSecureCookies: PROTOCOL === 'https',
    crossSubDomainCookies: { enabled: true, domain: BASE_HOST },
    // Bak Cloudflare og nginx: ekte klient-IP (viktig for bremsene over).
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-real-ip'] }
  },

  databaseHooks: {
    // Hver Better Auth-bruker har en Flatr-bruker (medlemskap, profil, farge).
    user: {
      create: { after: async (user) => void upsertUser(user.email, user.name) },
      update: {
        after: async (user) => {
          if (user?.email && user?.name) platformDb.prepare('UPDATE users SET name = ? WHERE email = ?').bind(user.name, normEmail(user.email)).runSync();
        }
      }
    }
  },

  telemetry: { enabled: false },
  plugins: [twoFactor({ issuer: 'Flatr', schema: { twoFactor: { modelName: 'auth_two_factor' } } })]
};

if (!options.secret) throw new Error('BETTER_AUTH_SECRET mangler i .env');

// Tabellene opprettes/oppdateres ved oppstart.
const { runMigrations } = await getMigrations(options);
await runMigrations();

export const auth = betterAuth(options);

/** Better Auth-økten for en forespørsel (null hvis ikke innlogget). */
export async function authSession(request) {
  try {
    return await auth.api.getSession({ headers: request.headers });
  } catch {
    return null;
  }
}

const findAuthUser = (email) =>
  platformDb.prepare('SELECT * FROM auth_user WHERE email = ?').bind(normEmail(email)).firstSync();

/**
 * Sørger for at en e-postadresse har en (bekreftet) Better Auth-bruker uten
 * passord – til eksisterende Flatr-brukere og inviterte. Passord settes
 * senere via invitasjon eller «Glemt passord».
 */
export async function ensureAuthUser(email, name) {
  const existing = findAuthUser(email);
  if (existing) return existing;
  const ctx = await auth.$context;
  return ctx.internalAdapter.createUser({ email: normEmail(email), name: name || normEmail(email).split('@')[0], emailVerified: true });
}

/** Har brukeren et passord? (Ellers må det settes via invitasjon/«Glemt passord».) */
export function hasPassword(email) {
  const u = findAuthUser(email);
  if (!u) return false;
  return !!platformDb.prepare(`SELECT 1 FROM auth_account WHERE userId = ? AND providerId = 'credential' AND password IS NOT NULL`).bind(u.id).firstSync();
}

/** Setter passord for en bruker (invitasjon godtatt). Lager innloggingskontoen om den mangler. */
export async function setPassword(email, password) {
  const ctx = await auth.$context;
  const user = findAuthUser(email);
  if (!user) throw new Error('Finner ikke brukeren');
  const hash = await ctx.password.hash(password);
  const account = await ctx.internalAdapter.findCredentialAccount?.(user.id);
  if (account) await ctx.internalAdapter.updatePassword(user.id, hash);
  else await ctx.internalAdapter.createAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash });
}

/**
 * Engangsjobb ved oppstart: alle eksisterende Flatr-brukere får en Better
 * Auth-bruker (bekreftet e-post, uten passord). App Store-kontoen får
 * passordet fra REVIEW_PASSWORD, så Apple sin innlogging virker som før.
 */
export async function migrateExistingUsers() {
  const users = platformDb.prepare('SELECT email, name FROM users').allSync().results;
  for (const u of users) await ensureAuthUser(u.email, u.name);
  const reviewEmail = normEmail(process.env.REVIEW_EMAIL);
  if (reviewEmail && process.env.REVIEW_PASSWORD && findAuthUser(reviewEmail) && !hasPassword(reviewEmail)) {
    await setPassword(reviewEmail, process.env.REVIEW_PASSWORD);
  }
}
