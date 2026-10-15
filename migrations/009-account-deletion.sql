-- Account deletion requests (ARCHITECTURE §5 "Account deletion").
--
-- One row is the whole state machine, and it is the only new table: the durable tombstone
-- deliberately lives outside the database, because a record that only exists inside the
-- database is restored along with the identity it is meant to keep down.
--
-- Purely additive, so every existing account is untouched and an image predating this
-- feature simply ignores the table.
--
-- `requested_at` is when the person completed the first ceremony. `eligible_at` is the end
-- of the cooling-off period, after which the final ceremony is accepted; `expires_at` is
-- when an unclaimed request lapses back to no request at all. Both are stored rather than
-- derived so that changing the two durations can never silently move the goalposts of a
-- request that is already open. `exported_at` records that a full personal-data export was
-- generated *after* the request, which the final step requires; it stays null until then.
--
-- The row references `user(id)` with a cascade on purpose: a completed deletion removes the
-- request along with the identity, and a withdrawal deletes the row directly. Nothing here
-- outlives the account it describes.
create table "account_deletions" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "requested_at" integer not null,
  "eligible_at" integer not null,
  "expires_at" integer not null,
  "exported_at" integer
);

-- Requests are read on every account page view and swept for lapse by timestamp, so the
-- eligibility window is the access path that matters.
create index "account_deletions_window" on "account_deletions" ("eligible_at", "expires_at");
