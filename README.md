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
2. In Neon, create a database and set `DATABASE_URL`.
3. In Clerk, create the application, set the two Clerk keys, then add the relevant
   Clerk user IDs to the reviewer/admin allowlists.
4. In Pinata, create a scoped JWT for file signing. For `private-ipfs`, verify the
   account supports Private IPFS before selecting that mode.
5. For the encrypted-public mode, run `npm run keys:evidence` once. Place only the
   printed public JWK on the `NEXT_PUBLIC_EVIDENCE_PUBLIC_KEY_JWK=` line. Store the
   printed private JWK offline; it is never a Vercel environment variable.
6. Run `npm install`, then `npm run db:generate`, `npm run db:migrate`, and
   `npm run db:seed`.
7. In Vercel, import this repository and set **Root Directory** to `vercel-app`.
   Add the same environment variables for Preview and Production, then deploy.

## Security boundaries

- `PINATA_JWT`, `DATABASE_URL`, and `CLERK_SECRET_KEY` are server-only.
- The Pinata JWT must never use a `NEXT_PUBLIC_` prefix.
- The public case API returns only `is_public=true` records.
- Submissions are always `restricted`. A reviewer or admin must write a separate,
  redacted public title and summary before publishing at `/review/evidence`; source
  files and original submission metadata remain restricted.
- Reviewer access is checked in the Route Handler, not merely hidden in the browser.
- The database stores searchable metadata, SHA-256 hashes, CIDs, encryption envelopes,
  state transitions, and audit events; it never stores evidence file bytes.

## Current implementation scope

Implemented: React/Next.js shell, Chinese/English UI, Neon/Drizzle relational schema,
initial case seed, public read endpoint, Clerk-backed contributor/reviewer roles,
short-lived Pinata upload intent, encrypted-public or Private-IPFS policy validation,
direct upload completion, a reviewer-only release queue at `/review/evidence`,
reviewer-only Private-IPFS access-link issuance, and public display of approved
redacted summaries.

Next acceptance slice: import the remainder of the current public archive into
PostgreSQL, then port the existing static interactions one section at a time before
production cutover.
