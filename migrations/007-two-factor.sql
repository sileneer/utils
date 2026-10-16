-- Two-factor state, generated from better-auth 1.7.7's own getMigrations() plan for
-- the twoFactor plugin rather than hand-designed, so the adapter's expectations and the
-- stored schema cannot drift.
--
-- Purely additive: `twoFactorEnabled` defaults to 0, so every account that exists
-- before this migration keeps signing in exactly as it did, and an image predating 2FA
-- simply ignores both objects. `secret` and `backupCodes` hold the library's symmetric
-- ciphertext; plaintext factor material never reaches this database.
alter table "user" add column "twoFactorEnabled" integer default 0;

create table "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" integer, "failedVerificationCount" integer, "lockedUntil" date);

create index "twoFactor_secret_idx" on "twoFactor" ("secret");

create index "twoFactor_userId_idx" on "twoFactor" ("userId");
