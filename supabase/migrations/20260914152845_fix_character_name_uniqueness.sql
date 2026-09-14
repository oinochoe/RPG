-- Fix character name uniqueness to exclude soft-deleted rows (final
-- whole-branch review finding): the design spec's Global Constraints say
-- character names are unique "among non-deleted characters" only, but
-- characters_name_key is a plain UNIQUE (name) with no partial predicate.
-- Live-confirmed: 12 of 13 rows in `characters` are soft-deleted
-- (deleted_at set), permanently locking their names even though those
-- characters no longer exist from the player's perspective. Symptom:
-- create "전사" -> delete it -> try to re-create "전사" -> 409
-- name_already_taken forever.
--
-- Fix: drop the plain unique constraint and replace it with a partial
-- unique index that only applies to active (non-deleted) rows. A partial
-- unique index still raises 23505 on violation, so the existing
-- create_character RPC's 23505 -> 409 name_already_taken mapping in
-- characters.ts keeps working unchanged.
ALTER TABLE public.characters DROP CONSTRAINT characters_name_key;

CREATE UNIQUE INDEX uq_characters__name_active ON public.characters (name) WHERE deleted_at IS NULL;
