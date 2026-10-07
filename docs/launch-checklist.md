# Launch checklist

Legal and privacy items found in a pre-launch review (2026-10-07), prompted by a
viral list of "six legal traps in AI-built apps" checked against what this app
actually does. **Not legal advice** — the lawyer items below are the questions
to bring to one.

## MUST DO BEFORE LAUNCH

- [ ] **Real privacy contact.** Replace the placeholder `privacy@example.com`
  in `src/utils/privacyContact.ts`. It appears on the privacy policy and in the
  delete-account error, and it must be an inbox someone reads (data and
  deletion requests arrive there).
- [ ] **Apply migration 014 (account deletion).** Paste
  `supabase/migrations/014_delete_own_account.sql` into the Supabase SQL editor
  (it must run as `postgres`). Then test with a throwaway player account: sign
  up, finish a puzzle, Profile → Delete account → confirm. Check in the
  dashboard that the user is gone from Auth and its `puzzle_completions` rows
  are gone. Until it is applied, the button falls back to "email us".
- [ ] **One hour with a lawyer**, on:
  - **COPPA**: is the game "directed to children" (cartoon pixel art, fantasy
    heroes)? Players can create accounts (email, password, public display
    name) and nothing asks their age. If it is child-directed or mixed
    audience, we need an age screen at sign-up and/or parental consent.
  - **GDPR scope** for EU visitors: lawful basis, consent ages (13–16 by
    country), records of processing, data processing agreements with Netlify
    (hosting), Supabase (database, accounts, storage; check the region) and
    Sentry (opt-in error reports).
  - **Privacy policy and terms**: the policy doesn't list processors or
    international transfers yet, and there are no terms of service.
- [ ] **Re-verify the security checklist** in `docs/PLAYER_APP_VISION.md`
  ("Security Checklist (Pre-Launch)"): dev app exposure on Netlify, RLS on
  every table (migration 013, creator-only writes, applied 2026-07-23), no
  service keys in client code.

## MUST DO BEFORE THESE FEATURES SHIP

- **Any marketing email** ("we launched", newsletters): an unsubscribe link and
  a physical postal address in every one (CAN-SPAM; a PO box or registered
  private mailbox is fine). EU recipients need prior opt-in consent. Account
  emails (sign-up confirmation, password reset) are transactional and exempt.
- **Payments** (the vision doc plans a one-time archive purchase and paid cloud
  sync): price and terms at checkout, and a refund policy. If anything renews,
  that's a subscription: California's auto-renewal law needs the renewal terms
  right next to the subscribe button, affirmative consent, an acknowledgment
  email and online cancellation, or renewals can be treated as gifts we must
  refund. EU VAT applies to digital sales (a merchant of record or Stripe Tax).
- **Player-shared content** (custom levels, uploaded avatars, comments):
  register a DMCA designated agent with the US Copyright Office ($6, renew
  every 3 years), publish the agent's contact, and set up takedowns and a way
  to report content. Today only the creator team can upload, so this doesn't
  apply yet.
- **Session replay or any new tracker**: Sentry runs errors-only, with no
  replay, behind the consent banner. If replay or any new third-party script
  is ever added, keep it behind consent with all inputs masked, update the
  privacy policy, and bump `CONSENT_VERSION` in `src/utils/consent.ts`.
- **New fonts**: add them to `scripts/self-host-fonts.mjs` and rerun it. Never
  link Google Fonts directly; that sends every visitor's IP address to Google.

## STRONGLY RECOMMENDED

- **Accessibility pass**: keyboard reach, screen-reader names on icon-only
  buttons, contrast. Website accessibility demand letters (ADA) are the most
  common legal threat to small sites, though they mostly target businesses
  that sell something.

## DONE (2026-10-07)

- Fonts self-hosted: no visitor request goes to Google (`public/fonts`,
  `scripts/self-host-fonts.mjs`).
- Privacy policy: a Children section; Accounts now mentions the public display
  name and account deletion.
- In-app account deletion for players (Profile → Delete account). It needs
  migration 014 applied (above).
- Confirmed: Sentry is errors-only, with no session replay, opt-in; no payments;
  no marketing email; players can't upload anything.
