-- The original 5 quest titles were plain "kill N of X" labels with no story behind them —
-- rewritten so each quest ties a specific, personal loss to its monster target (see
-- src/stores/questStore.ts's QUEST_DEFS hookText/completionText for the actual dialogue,
-- which is UI-only since quest_templates has no description column). Title here is kept in
-- sync purely for anyone reading the table directly — the client always renders from
-- QUEST_DEFS, never this column.
UPDATE quest_templates SET title = '여울의 작은 꽃' WHERE id = 1;
UPDATE quest_templates SET title = '무너지는 밭' WHERE id = 2;
UPDATE quest_templates SET title = '옛 전우들' WHERE id = 3;
UPDATE quest_templates SET title = '꺼지지 않는 등불' WHERE id = 4;
UPDATE quest_templates SET title = '돌아오지 않은 아들' WHERE id = 5;
