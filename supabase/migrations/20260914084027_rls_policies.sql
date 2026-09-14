CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid();
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monster_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monster_drop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_monster_spawns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monster_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduler_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own row" ON public.users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "master data readable by authenticated" ON public.map_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.monster_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.item_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.skill_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.quest_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.monster_drop_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.map_monster_spawns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "master data readable by authenticated" ON public.monster_instances
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "announcements readable by authenticated" ON public.announcements
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "characters owner read" ON public.characters
  FOR SELECT TO authenticated
  USING (user_id = public.current_app_user_id());
CREATE POLICY "character_skills owner read" ON public.character_skills
  FOR SELECT TO authenticated
  USING (character_id IN (SELECT id FROM public.characters WHERE user_id = public.current_app_user_id()));
CREATE POLICY "character_inventory owner read" ON public.character_inventory
  FOR SELECT TO authenticated
  USING (character_id IN (SELECT id FROM public.characters WHERE user_id = public.current_app_user_id()));
CREATE POLICY "character_quests owner read" ON public.character_quests
  FOR SELECT TO authenticated
  USING (character_id IN (SELECT id FROM public.characters WHERE user_id = public.current_app_user_id()));
