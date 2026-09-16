ALTER TABLE characters
  ADD COLUMN stat_str INT NOT NULL DEFAULT 5 CHECK (stat_str >= 0),
  ADD COLUMN stat_dex INT NOT NULL DEFAULT 5 CHECK (stat_dex >= 0),
  ADD COLUMN stat_con INT NOT NULL DEFAULT 5 CHECK (stat_con >= 0),
  ADD COLUMN stat_int INT NOT NULL DEFAULT 5 CHECK (stat_int >= 0),
  ADD COLUMN stat_wis INT NOT NULL DEFAULT 5 CHECK (stat_wis >= 0);
