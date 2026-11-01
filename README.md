# CRN Vercel migration

This directory is a standalone Next.js application prepared for a Vercel project.
It intentionally does not replace the repository's existing static Site. Keep the
current Site live until this application passes visual, data, and security acceptance.

## Confirmed architecture

```text
Browser
  ├─ Next.js public archive on Vercel
  ├─ Vercel Route Handlers: validation, authorization, audit
  ├─ Neon PostgreSQL: reviewed public records and restricted metadata
  └─ Pinata: evidence file bytes uploaded directly with short-lived signed URLs
```

The Vercel function never receives the evidence file body. It only creates an upload
intent and a short-lived Pinata URL, then records the returned CID. This avoids
function payload limits and keeps Pinata credentials server-side.

## Pinata privacy decision

Pinata Private IPFS requires an eligible Pinata plan. Select exactly one safe mode:

- `private-ipfs` + `PINATA_NETWORK=private`: raw evidence uses Pinata Private IPFS.
  This needs `PINATA_PRIVATE_GATEWAY_URL` and an eligible Pinata plan.
- `encrypted-public-ipfs` + `PINATA_NETWORK=public`: the browser encrypts every file
  with AES-256-GCM before uploading encrypted bytes to public IPFS. The per-file
  content key is wrapped using `NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK`. Keep the matching
  private key offline and out of Vercel, Git, and browser configuration.

The second mode is the correct default for a free Pinata account, but reviewer-side
decryption must be performed using the offline private key. Do not upload unencrypted
evidence to public IPFS.

## Required setup

1. Copy `.env.example` to `.env.local`; fill every `REPLACE_ME` value.

   Set `NEXT_PUBLIC_X_MENTION_HANDLES` to the comma-separated X usernames that
   visitors may mention from the sharing centre (without `@`), for example
   `account_one,account_two`. The legacy single-account
   `NEXT_PUBLIC_X_MENTION_HANDLE` value remains supported. These are public values,
   not secrets.
2. In Neon, create a database and set `DATABASE_URL`.
3. In Clerk, create the application, set the two Clerk keys, then add the relevant
   Clerk user IDs to the reviewer/admin allowlists.
4. In Pinata, create a scoped JWT for file signing. For `private-ipfs`, verify the
   account supports Private IPFS before selecting that mode.
5. For the encrypted-public mode, run `npm run keys:evidence` once. Place only the
   printed public JWK on the `NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK=` line. Store the
   printed private JWK offline; it is never a Vercel environment variable.
6. Run `npm install`, then `npm run db:generate`, `npm run db:migrate:local`, and
   `npm run db:seed` for a local environment.
7. In Vercel, import this repository and set **Root Directory** to `vercel-app`.
   Add the same environment variables for Preview and Production, then deploy.

## Production database migrations

Vercel's Git deployment runs the configured build; it does not automatically run
`npm run db:migrate`. Do not hide migrations inside `next build`: Preview and
Production builds can overlap, and an application rollback does not roll back the
database.

Use this release order for Production:

1. Back up or branch the Neon production database.
2. Set `DATABASE_URL` in the dedicated release/CI environment.
3. Run `npm ci`, `npm run db:check`, and `npm run db:migrate` exactly once.
4. Run `npm run verify` against the release commit.
5. Promote or trigger the Vercel Production deployment.

`db:migrate` consumes the environment's `DATABASE_URL`; `db:migrate:local` is the
only command that loads `.env.local`. Keep Preview and Production databases
separate. The migrations in `drizzle/` include compatibility backfills for the
existing single public case.

## Multi-user case workflow

- Any authenticated contributor can create a private case submission at
  `/workspace/cases/new`; an idempotency key and database-backed rate limit prevent
  accidental duplicates and burst abuse.
- Platform reviewers triage submissions at `/review/cases`. Accepting a submission
  creates a private canonical case owned by the original submitter; it does not
  publish allegations.
- Case editors manage metadata, timeline entries, entities, relationships, and
  case-local wallet roles in `/workspace/cases/[caseId]`.
- Case owners can add owners, editors, reviewers, and viewers by Clerk User ID.
  Case-scoped reviewers can access only that case's evidence and signature queues.
  Publishing remains reserved for organization publishers or platform admins.
- Review and publication are separate permissions. Publication creates an immutable
  JSON snapshot and SHA-256 content hash. `/api/public/cases/*` reads only that
  snapshot, never the editable work tables.
- A daily Vercel Cron Job expires abandoned upload intents and prunes rate-limit
  buckets. Set `CRON_SECRET` in Production; Vercel calls the job in UTC.

## Security boundaries

- `PINATA_JWT`, `DATABASE_URL`, and `CLERK_SECRET_KEY` are server-only.
- The Pinata JWT must never use a `NEXT_PUBLIC_` prefix.
- The public case API returns only the current immutable publication for cases with
  `visibility=public` and a non-null published version. Editable work tables are
  never serialized directly to public clients.
- Submissions are always `restricted`. A reviewer or admin must write a separate,
  redacted public title and summary before publishing at `/review/evidence`; source
  files and original submission metadata remain restricted.
- Reviewer access is checked in the Route Handler, not merely hidden in the browser.
- The database stores searchable metadata, SHA-256 hashes, CIDs, encryption envelopes,
  state transitions, and audit events; it never stores evidence file bytes.

## Current implementation scope

Implemented: multi-user private intake with correction/resubmission and withdrawal,
organization and case-scoped authorization, member delegation, case workflow review
with persisted feedback, structured case editing, normalized reusable wallet assets,
immutable public publication snapshots, public case directory/detail routes,
database-backed rate limits, idempotent writes, audited evidence upload verification,
review queues, signature moderation, outbox records, and scheduled maintenance.

External production dependencies still required before accepting untrusted traffic:
a malware scanning service for uploaded files, an outbox worker/notification provider,
operational alerts, database backups, and a legal/privacy review policy.
