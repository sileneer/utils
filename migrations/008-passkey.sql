-- Passkey credentials, generated from better-auth 1.7.7's own getMigrations() plan for
-- @better-auth/passkey 1.7.7 rather than hand-designed, so the adapter's expectations and
-- the stored schema cannot drift.
--
-- Purely additive: no existing table changes and no column gains a default, so every
-- account that exists before this migration is untouched and an image predating passkeys
-- simply ignores the table.
--
-- `publicKey` is the COSE key in base64 and `credentialID` is the authenticator's public
-- identifier — neither is a secret, and neither can be used to sign. No private key ever
-- exists on this server, in this database, or in a log.
create table "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" integer not null, "transports" text, "createdAt" date, "aaguid" text);

create index "passkey_userId_idx" on "passkey" ("userId");

create index "passkey_credentialID_idx" on "passkey" ("credentialID");

-- Hardening beyond the generated plan. The plugin only *asks* the browser to exclude the
-- account's existing credentials, so without this a client that ignores `excludeCredentials`
-- could store the same credential twice, after which a lookup by credentialID would resolve
-- to whichever row the database happens to return first. An extra index is invisible to the
-- adapter's schema check, which compares tables and columns.
create unique index "passkey_credentialID_unique" on "passkey" ("credentialID");
