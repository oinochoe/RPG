-- Atomic inventory grant + one-time cleanup of split stacks.
--
-- Bug: picking up (or buying / being rewarded) a stackable item -- potions, scrolls -- did
-- "SELECT existing stack; if none INSERT" from the edge function with no lock and no unique
-- constraint. Several grants in flight at once (multi-kill drops picked up back to back, F5
-- mashing, a quest reward landing next to a pickup) all saw "no stack yet" and each inserted its
-- own row, so the same potion showed up as several separate rows. And once a character had two
-- rows of an item, the function's `.maybeSingle()` stack lookup errored on "more than one row",
-- so that item could never be picked up again.
--
-- Fix: do the whole stack-or-insert inside one function, serialized per character with the same
-- advisory lock the other economy RPCs use, and have the edge function call it.

CREATE OR REPLACE FUNCTION public.grant_inventory_item(
  p_character_id INT,
  p_item_template_id INT,
  p_quantity INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_equip_slot TEXT;
  v_stack_id INT;
  v_next_slot INT;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'invalid_quantity' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(p_character_id);

  SELECT it.equip_slot INTO v_equip_slot
  FROM public.item_templates AS it
  WHERE it.id = p_item_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Non-equippable items (potions, scrolls, ...) stack onto the oldest existing row. Gear always
  -- gets its own row, since each piece can end up with its own enchant_level.
  IF v_equip_slot IS NULL THEN
    SELECT ci.id INTO v_stack_id
    FROM public.character_inventory AS ci
    WHERE ci.character_id = p_character_id
      AND ci.item_template_id = p_item_template_id
      AND ci.storage_type = 'inventory'
    ORDER BY ci.id ASC
    LIMIT 1;

    IF v_stack_id IS NOT NULL THEN
      UPDATE public.character_inventory
      SET quantity = quantity + p_quantity, updated_at = NOW()
      WHERE id = v_stack_id;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(ci.slot_index), -1) + 1 INTO v_next_slot
  FROM public.character_inventory AS ci
  WHERE ci.character_id = p_character_id;

  INSERT INTO public.character_inventory
    (character_id, item_template_id, storage_type, slot_index, quantity, enchant_level, is_equipped, equipped_slot)
  VALUES
    (p_character_id, p_item_template_id, 'inventory', v_next_slot,
     CASE WHEN v_equip_slot IS NULL THEN p_quantity ELSE 1 END, 0, FALSE, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_inventory_item(INT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_inventory_item(INT, INT, INT) TO service_role;

-- One-time cleanup: merge stacks that were already split. Only stackable (non-equippable), unequipped
-- rows in the bag are touched; the oldest row of each group keeps the summed quantity.
WITH dup AS (
  SELECT ci.character_id, ci.item_template_id, MIN(ci.id) AS keep_id, SUM(ci.quantity) AS total
  FROM public.character_inventory AS ci
  JOIN public.item_templates AS it ON it.id = ci.item_template_id
  WHERE it.equip_slot IS NULL AND ci.storage_type = 'inventory' AND ci.is_equipped = FALSE
  GROUP BY ci.character_id, ci.item_template_id
  HAVING COUNT(*) > 1
),
merged AS (
  UPDATE public.character_inventory AS ci
  SET quantity = dup.total, updated_at = NOW()
  FROM dup
  WHERE ci.id = dup.keep_id
  RETURNING ci.id
)
DELETE FROM public.character_inventory AS ci
USING dup
WHERE ci.character_id = dup.character_id
  AND ci.item_template_id = dup.item_template_id
  AND ci.id <> dup.keep_id
  AND ci.storage_type = 'inventory'
  AND ci.is_equipped = FALSE;
