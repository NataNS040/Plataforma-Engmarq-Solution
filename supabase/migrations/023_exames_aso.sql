-- Exames/ASO remains in documentos. No business-data backfill or Storage writes.
BEGIN;
LOCK TABLE public.documentos, public.documento_tipos, public.exames_catalogo IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.documentos'::regclass
   AND conname='documentos_colaborador_tenant_fkey' AND convalidated)
 OR (SELECT count(*) FROM public.documento_tipos WHERE lower(btrim(nome))='aso')<>1
 OR to_regprocedure('engmarq_private.guard_documento_metadata()') IS NULL
 OR to_regprocedure('engmarq_private.guard_documento_reference()') IS NULL
 OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.documentos'::regclass,'storage.objects'::regclass) AND NOT relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='documentos' AND NOT public AND file_size_limit=10485760)
 THEN RAISE EXCEPTION '023 requires intact 021 contract and private documentos Storage'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exames_catalogo'
 AND policyname<>'exames_catalogo_read') THEN RAISE EXCEPTION 'Unexpected exames_catalogo policies'; END IF;
END $$;

ALTER TABLE public.documentos ADD COLUMN resultado_aso text;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_resultado_aso_check
 CHECK(resultado_aso IS NULL OR resultado_aso IN ('apto','apto_com_restricao','inapto'));
COMMENT ON COLUMN public.documentos.resultado_aso IS 'Explicit ASO result; legacy observations are never converted';

CREATE FUNCTION engmarq_private.guard_aso_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE aso uuid; was_aso boolean := false;
BEGIN
 SELECT id INTO aso FROM public.documento_tipos WHERE lower(btrim(nome))='aso';
 IF TG_OP='UPDATE' THEN was_aso := OLD.tipo_id=aso; END IF;
 IF NEW.tipo_id=aso THEN
   IF TG_OP='INSERT' OR NOT was_aso THEN
     IF NEW.colaborador_id IS NULL OR NEW.subtipo_exame IS NULL THEN
       RAISE EXCEPTION 'New ASO requires employee and subtype' USING ERRCODE='23514';
     END IF;
   ELSIF (NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id AND NEW.colaborador_id IS NULL)
      OR (NEW.subtipo_exame IS DISTINCT FROM OLD.subtipo_exame AND NEW.subtipo_exame IS NULL) THEN
     RAISE EXCEPTION 'ASO employee and subtype cannot be cleared' USING ERRCODE='23514';
   END IF;
   IF (TG_OP='INSERT' OR NEW.emissao IS DISTINCT FROM OLD.emissao OR NEW.vencimento IS DISTINCT FROM OLD.vencimento)
      AND NEW.vencimento<NEW.emissao THEN
     RAISE EXCEPTION 'ASO expiry precedes issue date' USING ERRCODE='23514';
   END IF;
   IF TG_OP='INSERT' OR NEW.exames_realizados IS DISTINCT FROM OLD.exames_realizados THEN
     IF NEW.exames_realizados IS NOT NULL AND (
       (cardinality(NEW.exames_realizados)>0 AND (array_ndims(NEW.exames_realizados)<>1 OR array_lower(NEW.exames_realizados,1)<>1))
       OR EXISTS(SELECT 1 FROM unnest(NEW.exames_realizados) x WHERE x IS NULL OR NOT EXISTS(SELECT 1 FROM public.exames_catalogo c WHERE c.nome=x))
       OR EXISTS(SELECT 1 FROM unnest(NEW.exames_realizados) x GROUP BY x HAVING count(*)>1)) THEN
       RAISE EXCEPTION 'Invalid ASO procedures' USING ERRCODE='23514';
     END IF;
   END IF;
 ELSIF NEW.resultado_aso IS NOT NULL THEN
   RAISE EXCEPTION 'ASO result requires ASO document type' USING ERRCODE='23514';
 ELSIF (TG_OP='INSERT' AND cardinality(NEW.exames_realizados)>0)
    OR (TG_OP='UPDATE' AND NEW.exames_realizados IS DISTINCT FROM OLD.exames_realizados) THEN
   RAISE EXCEPTION 'Procedures require ASO document type' USING ERRCODE='23514';
 END IF;
 -- Updating an ASO into a different type would bypass the operational contract.
 IF was_aso AND NEW.tipo_id IS DISTINCT FROM OLD.tipo_id THEN
   RAISE EXCEPTION 'ASO document type is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION engmarq_private.guard_aso_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_aso_write BEFORE INSERT OR UPDATE ON public.documentos
FOR EACH ROW EXECUTE FUNCTION engmarq_private.guard_aso_write();

GRANT INSERT(exames_realizados,resultado_aso), UPDATE(exames_realizados,resultado_aso)
ON public.documentos TO authenticated;
-- RLS/021 guards still restrict these grants to active empresa/gestor in their tenant.
CREATE FUNCTION engmarq_private.can_read_exames_catalogo() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT current_setting('role',true)='authenticated' AND EXISTS(
 SELECT 1 FROM public.user_profiles p JOIN public.empresas e ON e.id=p.empresa_id
 WHERE p.id=auth.uid() AND p.active AND e.status='ativa'
 AND p.role IN ('empresa','gestor','operacional'))
$$;
REVOKE ALL ON FUNCTION engmarq_private.can_read_exames_catalogo() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION engmarq_private.can_read_exames_catalogo() TO authenticated;
ALTER TABLE public.exames_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY exames_catalogo_read ON public.exames_catalogo;
CREATE POLICY exames_catalogo_read ON public.exames_catalogo FOR SELECT TO authenticated
USING(engmarq_private.can_read_exames_catalogo());
REVOKE ALL ON public.exames_catalogo FROM PUBLIC,anon,authenticated;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.exames_catalogo'::regclass AND attnum>0 AND NOT attisdropped LOOP
 EXECUTE format('REVOKE ALL (%I) ON public.exames_catalogo FROM PUBLIC,anon,authenticated',c.attname);
 END LOOP;
END $$;
GRANT SELECT ON public.exames_catalogo TO authenticated;
CREATE INDEX idx_documentos_aso_tenant_tipo_colaborador ON public.documentos(empresa_id,tipo_id,colaborador_id);

-- Live temporal status: ASOs 30 days; other documents retain the existing 60-day rule.
CREATE OR REPLACE VIEW public.vw_dashboard_documentos WITH(security_invoker=true) AS
SELECT d.empresa_id,dt.nome AS tipo_nome,d.titulo,d.vencimento,
 CASE WHEN d.vencimento IS NULL THEN 'vigente'
 WHEN d.vencimento<CASE WHEN lower(btrim(dt.nome))='aso' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date ELSE CURRENT_DATE END THEN 'vencido'
 WHEN d.vencimento<=CASE WHEN lower(btrim(dt.nome))='aso' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date ELSE CURRENT_DATE END
 + CASE WHEN lower(btrim(dt.nome))='aso' THEN 30 ELSE 60 END THEN 'vencendo'
 ELSE 'vigente' END AS status_calculado,
 (d.vencimento-CASE WHEN lower(btrim(dt.nome))='aso' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date ELSE CURRENT_DATE END) AS dias_restantes
FROM public.documentos d JOIN public.documento_tipos dt ON dt.id=d.tipo_id;
COMMIT;
