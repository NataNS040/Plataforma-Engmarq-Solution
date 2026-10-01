-- Requires 015. No business data is changed. Apply only after reviewing preflight.
BEGIN;

-- Stabilize both sides during preflight/constraint replacement. Fail atomically
-- on legacy inconsistencies rather than deleting, moving or repairing records.
LOCK TABLE public.colaboradores, public.funcoes, public.setores, public.ambientes
  IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.colaboradores c
    LEFT JOIN public.funcoes f ON f.id = c.funcao_id AND f.empresa_id = c.empresa_id
    LEFT JOIN public.setores s ON s.id = c.setor_id AND s.empresa_id = c.empresa_id
    LEFT JOIN public.ambientes a ON a.id = c.ambiente_id AND a.empresa_id = c.empresa_id
    WHERE f.id IS NULL OR s.id IS NULL OR (c.ambiente_id IS NOT NULL AND a.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Colaboradores has incompatible tenant/catalog references; audit legacy rows before applying 016'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.funcoes ADD CONSTRAINT funcoes_empresa_id_id_key UNIQUE (empresa_id, id);
ALTER TABLE public.setores ADD CONSTRAINT setores_empresa_id_id_key UNIQUE (empresa_id, id);
ALTER TABLE public.ambientes ADD CONSTRAINT ambientes_empresa_id_id_key UNIQUE (empresa_id, id);

-- Replace, do not duplicate, the original FKs: PostgREST embeds remain unambiguous.
-- Unexpected constraint names/schema drift abort the transaction for review.
ALTER TABLE public.colaboradores
  DROP CONSTRAINT colaboradores_funcao_id_fkey,
  DROP CONSTRAINT colaboradores_setor_id_fkey,
  DROP CONSTRAINT colaboradores_ambiente_id_fkey,
  ADD CONSTRAINT colaboradores_funcao_id_fkey FOREIGN KEY (empresa_id, funcao_id)
    REFERENCES public.funcoes (empresa_id, id),
  ADD CONSTRAINT colaboradores_setor_id_fkey FOREIGN KEY (empresa_id, setor_id)
    REFERENCES public.setores (empresa_id, id),
  ADD CONSTRAINT colaboradores_ambiente_id_fkey FOREIGN KEY (empresa_id, ambiente_id)
    REFERENCES public.ambientes (empresa_id, id);

CREATE OR REPLACE FUNCTION engmarq_private.can_access_colaboradores(
  target_empresa uuid, for_write boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() AND p.active AND e.status = 'ativa'
      AND p.empresa_id = target_empresa
      AND (p.role IN ('empresa', 'gestor') OR (NOT for_write AND p.role = 'operacional'))
  );
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_access_colaboradores(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_access_colaboradores(uuid, boolean) TO authenticated;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS colaboradores_select ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_write ON public.colaboradores;

-- Unexpected permissive policies must not survive unnoticed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
             WHERE schemaname = 'public' AND tablename = 'colaboradores') THEN
    RAISE EXCEPTION 'Unexpected colaboradores policies; review schema drift before applying 016';
  END IF;
END;
$$;

CREATE POLICY colaboradores_select ON public.colaboradores FOR SELECT TO authenticated
  USING (engmarq_private.can_access_colaboradores(empresa_id));
CREATE POLICY colaboradores_insert ON public.colaboradores FOR INSERT TO authenticated
  WITH CHECK (engmarq_private.can_access_colaboradores(empresa_id, true));
CREATE POLICY colaboradores_update ON public.colaboradores FOR UPDATE TO authenticated
  USING (engmarq_private.can_access_colaboradores(empresa_id, true))
  WITH CHECK (engmarq_private.can_access_colaboradores(empresa_id, true));

REVOKE ALL ON TABLE public.colaboradores FROM PUBLIC, anon, authenticated;
REVOKE SELECT (id, empresa_id, nome, cpf, matricula, funcao_id, setor_id, ambiente_id,
               data_admissao, data_demissao, active, created_at),
       INSERT (id, empresa_id, nome, cpf, matricula, funcao_id, setor_id, ambiente_id,
               data_admissao, data_demissao, active, created_at),
       UPDATE (id, empresa_id, nome, cpf, matricula, funcao_id, setor_id, ambiente_id,
               data_admissao, data_demissao, active, created_at),
       REFERENCES (id, empresa_id, nome, cpf, matricula, funcao_id, setor_id, ambiente_id,
                   data_admissao, data_demissao, active, created_at)
  ON public.colaboradores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.colaboradores TO authenticated;
GRANT INSERT (empresa_id, nome, cpf, matricula, funcao_id, setor_id, ambiente_id, data_admissao, active)
  ON public.colaboradores TO authenticated;
GRANT UPDATE (nome, matricula, funcao_id, setor_id, ambiente_id, active, data_demissao)
  ON public.colaboradores TO authenticated;

CREATE OR REPLACE FUNCTION engmarq_private.guard_colaborador_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor record;
BEGIN
  -- Infrastructure remains technical; no functional route uses these roles.
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;
  SELECT p.empresa_id, p.role, p.active, e.status AS company_status INTO actor
    FROM public.user_profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.id = auth.uid() FOR SHARE OF p, e;
  IF NOT FOUND OR NOT actor.active OR actor.company_status <> 'ativa'
     OR actor.role NOT IN ('empresa', 'gestor') OR NEW.empresa_id <> actor.empresa_id THEN
    RAISE EXCEPTION 'Colaborador write denied' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.active IS DISTINCT FROM true OR NEW.data_demissao IS NOT NULL THEN
      RAISE EXCEPTION 'New colaborador must be active' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.empresa_id <> actor.empresa_id
       OR (to_jsonb(NEW) - ARRAY['nome','matricula','funcao_id','setor_id','ambiente_id','active','data_demissao'])
          IS DISTINCT FROM
          (to_jsonb(OLD) - ARRAY['nome','matricula','funcao_id','setor_id','ambiente_id','active','data_demissao']) THEN
      RAISE EXCEPTION 'Immutable colaborador fields' USING ERRCODE = '42501';
    END IF;
    IF (NOT OLD.active AND NEW.active)
       OR ((NEW.active, NEW.data_demissao) IS DISTINCT FROM (OLD.active, OLD.data_demissao)
           AND (NEW.active OR NEW.data_demissao IS NULL)) THEN
      RAISE EXCEPTION 'Deactivation requires active=false and dismissal date; reactivation is not supported'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION engmarq_private.guard_colaborador_write() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_colaborador_write BEFORE INSERT OR UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_colaborador_write();

COMMIT;
