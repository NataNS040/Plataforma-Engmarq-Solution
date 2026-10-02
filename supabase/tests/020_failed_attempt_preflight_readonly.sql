-- Run FIRST after the failed hosted 020, in a fresh SQL Editor execution.
-- Strict read-only transaction; no locks, DDL, DML or temporary objects.
BEGIN TRANSACTION READ ONLY;
-- PÃ³s-019 / prÃ©-020. SOMENTE LEITURA: nenhum DDL/DML ou objeto temporÃ¡rio.
-- Origin validado pelo operador. SET e SELECT devem ser executados juntos.
-- Esta configuraÃ§Ã£o de sessÃ£o nÃ£o altera bucket, policies nem dados.
SET engmarq.storage_origin = 'https://kkjckayiqvlqpdjyoxyv.supabase.co';
WITH
config AS (SELECT current_setting('engmarq.storage_origin',true) AS storage_origin),
required(relation, columns) AS (
  VALUES
    ('public.treinamentos', ARRAY['empresa_id','colaborador_id','treinamento_tipo_id','certificado_url']),
    ('public.matriz_treinamentos', ARRAY['empresa_id','funcao_id','treinamento_tipo_id']),
    ('public.colaboradores', ARRAY['id','empresa_id']),
    ('public.funcoes', ARRAY['id','empresa_id']),
    ('public.treinamento_tipos', ARRAY['id']),
    ('public.documentos', ARRAY['id','empresa_id','arquivo_url','arquivo_path']),
    ('public.empresas', ARRAY['id']),
    ('public.user_profiles', ARRAY['id','empresa_id','role','active']),
    ('public.vw_dashboard_treinamentos', ARRAY['empresa_id']),
    ('storage.buckets', ARRAY['id','public','file_size_limit','allowed_mime_types']),
    ('storage.objects', ARRAY['bucket_id','name','metadata'])
),
structures AS (
  SELECT r.relation, c.oid,
    c.oid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(r.columns) x(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname=x.column_name
          AND a.attnum>0 AND NOT a.attisdropped
      )
    ) AS complete,
    CASE WHEN c.oid IS NULL THEN false ELSE
      has_table_privilege(current_user,c.oid,'SELECT')
      AND (NOT c.relrowsecurity
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                   WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
        OR (NOT c.relforcerowsecurity AND pg_has_role(current_user,c.relowner,'USAGE')))
    END AS unrestricted_read
  FROM required r
  LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass(r.relation)
),
ready AS (
  SELECT bool_and(complete AND unrestricted_read)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)')
      AND provolatile='i' AND prorettype='text'::regtype) AS ok FROM structures
),
history AS (
  SELECT c.oid,
    CASE WHEN c.oid IS NULL THEN false ELSE
      has_table_privilege(current_user,c.oid,'SELECT')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                  WHERE attrelid=c.oid AND attname='version'
                    AND attnum>0 AND NOT attisdropped)
      AND (NOT c.relrowsecurity
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                   WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
        OR (NOT c.relforcerowsecurity AND pg_has_role(current_user,c.relowner,'USAGE')))
    END AS readable
  FROM (SELECT to_regclass('supabase_migrations.schema_migrations') AS oid) h
  LEFT JOIN pg_catalog.pg_class c ON c.oid=h.oid
),
history_result AS (
  -- SQL dinÃ¢mico de leitura evita referenciar uma tabela inexistente no parser.
  SELECT readable, CASE WHEN readable THEN
    ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM supabase_migrations.schema_migrations
       WHERE version::text IN (''018'',''18'',''020'',''20'')',
      true,false,'')))[1])::text::bigint
    ELSE NULL END AS applied
  FROM history
),
data_queries(ord,label,query_text,blocking) AS (
  VALUES
  (100,'Treinamentos: colaborador de outro tenant ou inexistente',
   $q$SELECT count(*) AS n FROM public.treinamentos t
      LEFT JOIN public.colaboradores c ON c.id=t.colaborador_id AND c.empresa_id=t.empresa_id
      WHERE c.id IS NULL$q$,true),
  (101,'Matriz: função de outro tenant ou inexistente',
   $q$SELECT count(*) AS n FROM public.matriz_treinamentos m
      LEFT JOIN public.funcoes f ON f.id=m.funcao_id AND f.empresa_id=m.empresa_id
      WHERE f.id IS NULL$q$,true),
  (102,'Treinamentos: certificate paths inválidos',
   $q$SELECT count(*) AS n FROM public.treinamentos
      WHERE certificado_url IS NOT NULL AND
        (empresa_id IS NULL OR certificado_url !~
          ('^' || empresa_id::text || '/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true),
  (103,'Treinamentos: tipo de treinamento inexistente',
   $q$SELECT count(*) AS n FROM public.treinamentos t
      LEFT JOIN public.treinamento_tipos tt ON tt.id=t.treinamento_tipo_id
      WHERE tt.id IS NULL$q$,true),
  (104,'Matriz: tipo de treinamento inexistente',
   $q$SELECT count(*) AS n FROM public.matriz_treinamentos m
      LEFT JOIN public.treinamento_tipos tt ON tt.id=m.treinamento_tipo_id
      WHERE tt.id IS NULL$q$,true),
  (105,'Registros de Documentos',
   $q$SELECT count(*) AS n FROM public.documentos$q$,false),
  (106,'Referências legadas não nulas',
   $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_url IS NOT NULL$q$,false),
  (107,'Referências legadas: formato, bucket ou tenant inválidos',
   $q$SELECT count(*) AS n FROM public.documentos
      WHERE arquivo_url IS NOT NULL AND
        (empresa_id IS NULL OR arquivo_url !~
          ('^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/documentos/' ||
           empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true),
  (109,'Objetos no bucket documentos',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'$q$,false),
  (110,'Objetos: path ou empresa inexistente/inválidos',
   $q$SELECT count(*) AS n FROM storage.objects o
      WHERE bucket_id='documentos' AND
        (name IS NULL OR name !~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
         OR NOT EXISTS (SELECT 1 FROM public.empresas e
                         WHERE e.id::text=split_part(o.name,'/',1)))$q$,true),
  (111,'Objetos: MIME ausente ou incompatível com a 020',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'
      AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype' NOT IN
        ('application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'image/jpeg','image/png'))$q$,true),
  (112,'Objetos: tamanho ausente, inválido ou acima de 10 MB',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'
      AND CASE WHEN coalesce(metadata->>'size','') !~ '^[0-9]+$' THEN true
               ELSE (metadata->>'size')::numeric>10485760 END$q$,true),
  (113,'Bucket documentos: existência',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos'$q$,false),
  (114,'Bucket documentos: público',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos' AND public IS DISTINCT FROM false$q$,false),
  (115,'Bucket documentos: limite/MIME diferentes da configuração final',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos' AND
      (file_size_limit IS DISTINCT FROM 10485760
       OR allowed_mime_types IS NULL
       OR NOT (allowed_mime_types @> ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']
         AND allowed_mime_types <@ ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']))$q$,false)
  UNION ALL
  SELECT 117,'Referências canônicas não nulas',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NOT NULL$q$,false
  UNION ALL
  SELECT 118,'Referências pendentes de backfill',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL$q$,false
  UNION ALL
  SELECT 119,'Paths canônicos inválidos ou de outro tenant',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NOT NULL AND
      (empresa_id IS NULL OR arquivo_path !~ ('^' || empresa_id::text ||
      '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true
  UNION ALL
  SELECT 120,'Referências canônicas sem objeto',
    $q$SELECT count(*) AS n FROM public.documentos d WHERE arquivo_path IS NOT NULL AND
      NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=d.arquivo_path)$q$,true
  UNION ALL
  SELECT 123,'Certificados de treinamento sem objeto',
    $q$SELECT count(*) AS n FROM public.treinamentos t WHERE certificado_url IS NOT NULL AND
      NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=t.certificado_url)$q$,true
  UNION ALL
  SELECT 121,'Objetos existentes sem referência atual',
    $q$SELECT count(*) AS n FROM storage.objects o WHERE o.bucket_id='documentos' AND NOT EXISTS (
      SELECT 1 FROM public.documentos d WHERE d.arquivo_path=o.name OR
      substring(d.arquivo_url FROM '^https://[^/]+/storage/v1/object/public/documentos/(.*)$')=o.name
    ) AND NOT EXISTS (SELECT 1 FROM public.treinamentos t WHERE t.certificado_url=o.name)$q$,false
  UNION ALL
  SELECT 122,'Referências duplas com identidades diferentes',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format($q$SELECT count(*) AS n FROM public.documentos
        WHERE arquivo_path IS NOT NULL AND arquivo_url IS NOT NULL
        AND left(arquivo_url,length(%L))=%L
        AND arquivo_path<>substr(arquivo_url,length(%L)+1)$q$,
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/')
    END,false FROM config
  UNION ALL
  SELECT 116,'Referências legadas: origin diferente do projeto confiável',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format('SELECT count(*) AS n FROM public.documentos
        WHERE arquivo_url IS NOT NULL AND left(arquivo_url,length(%L))<>%L',
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/')
    END,true FROM config
  UNION ALL
  SELECT 108,'Referências legadas aceitas pelo helper sem objeto',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format($q$SELECT count(*) AS n FROM public.documentos d WHERE d.arquivo_url IS NOT NULL
        AND d.arquivo_url ~ ('^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/documentos/' ||
          d.empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
        AND left(d.arquivo_url,length(%L))=%L
        AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos'
          AND o.name=engmarq_private.documento_legacy_path(d.arquivo_url,d.empresa_id,%L))$q$,
          storage_origin || '/storage/v1/object/public/documentos/',
          storage_origin || '/storage/v1/object/public/documentos/',storage_origin)
    END,true FROM config
),
data_results AS MATERIALIZED (
  SELECT q.*, CASE WHEN ready.ok AND q.query_text IS NOT NULL THEN
    ((xpath('/table/row/n/text()',query_to_xml(q.query_text,true,false,'')))[1])::text::bigint
    ELSE NULL END AS n
  FROM data_queries q CROSS JOIN ready
),
footprints(ord,label,n) AS (
  SELECT 30,'018: constraints criadas',count(*) FROM pg_catalog.pg_constraint
  WHERE (conrelid=to_regclass('public.colaboradores') AND conname='colaboradores_empresa_id_id_key')
     OR (conrelid=to_regclass('public.treinamentos') AND conname='treinamentos_certificado_path_check')
  UNION ALL
  SELECT 31,'018: funções criadas',count(*) FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='engmarq_private'
    AND p.proname IN ('guard_treinamento_write','can_access_certificado')
  UNION ALL
  SELECT 32,'018: triggers criados',count(*) FROM pg_catalog.pg_trigger
  WHERE NOT tgisinternal AND tgname='guard_treinamento_write'
  UNION ALL
  SELECT 33,'018: policies de certificados',count(*) FROM pg_catalog.pg_policies
  WHERE schemaname='storage' AND policyname IN
    ('certificados_select_guard','certificados_insert_guard','certificados_update_guard','certificados_delete_guard')
  UNION ALL
  SELECT 34,'018: view com security_invoker=true',count(*) FROM pg_catalog.pg_class
  WHERE oid=to_regclass('public.vw_dashboard_treinamentos')
    AND 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[]))
  UNION ALL
  SELECT 35,'018: FKs compostas ou alteradas',count(*) FROM pg_catalog.pg_constraint
  WHERE contype='f' AND
    ((conrelid=to_regclass('public.treinamentos') AND conname='treinamentos_colaborador_id_fkey')
      OR (conrelid=to_regclass('public.matriz_treinamentos') AND conname='matriz_treinamentos_funcao_id_fkey'))
    AND cardinality(conkey)<>1
  UNION ALL
  SELECT 36,'Policies inesperadas: treinamentos/matriz/tipos',count(*) FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND (
    (tablename='treinamentos' AND policyname NOT IN ('treinamentos_select','treinamentos_write'))
    OR (tablename='matriz_treinamentos' AND policyname NOT IN ('matriz_select','matriz_write'))
    OR (tablename='treinamento_tipos' AND policyname<>'treinamento_tipos_read'))

),
report AS (
  SELECT 10 AS ord, 'Estrutura: ' || relation AS label,
    CASE WHEN NOT complete THEN 'Tabela/view/colunas necessárias ausentes'
         WHEN NOT unrestricted_read THEN 'Leitura integral não comprovada: privilégios/RLS'
         ELSE 'Estrutura presente; leitura integral disponível' END AS result,
    CASE WHEN complete AND unrestricted_read THEN 'OK' ELSE 'BLOQUEIO' END AS status
  FROM structures
  UNION ALL
  SELECT 20,'Pré-requisito 017: helper e schema privado',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='engmarq_private' AND p.proname='can_access_catalogos'
        AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, boolean'
        AND p.prorettype='boolean'::regtype AND p.prosecdef
    ) THEN 'Helper presente com assinatura e SECURITY DEFINER esperados'
      ELSE 'Helper ausente ou estrutura incompatível' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='engmarq_private' AND p.proname='can_access_catalogos'
        AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, boolean'
        AND p.prorettype='boolean'::regtype AND p.prosecdef
    ) THEN 'OK' ELSE 'BLOQUEIO' END
  UNION ALL
  SELECT 21,'019: constraint de path validada',count(*)::text || '/1 constraint CHECK validada',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public.documentos')
    AND conname='documentos_arquivo_path_check' AND contype='c' AND convalidated
  UNION ALL
  SELECT 22,'019: helper de conversão',count(*)::text || '/1 helper IMMUTABLE com retorno text',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)')
    AND prorettype='text'::regtype AND provolatile='i'
  UNION ALL
  SELECT 23,'020: funções já existentes',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='engmarq_private' AND p.proname IN ('can_access_documento','guard_documento_reference')
  UNION ALL
  SELECT 24,'020: trigger de referência já existente',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_trigger WHERE tgrelid=to_regclass('public.documentos')
    AND NOT tgisinternal AND tgname='guard_documento_reference'
  UNION ALL
  SELECT 25,'020: guards de Storage já existentes',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('documentos_tenant_select_guard','documentos_tenant_insert_guard',
      'documentos_tenant_update_guard','documentos_tenant_delete_guard')
  UNION ALL
  SELECT 26,'020: policies já referenciam helper novo',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (coalesce(qual,'') LIKE '%can_access_documento%' OR coalesce(with_check,'') LIKE '%can_access_documento%')
  UNION ALL
  SELECT ord,label,n::text || ' ocorrência(s)',
    CASE WHEN n=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM footprints
  UNION ALL
  SELECT 40,'Histórico de migrations: 018/020',
    CASE WHEN NOT readable THEN 'Indisponível/inacessível; avaliar vestígios e log do executor'
         ELSE applied::text || ' registro(s) de aplicação da 018/020' END,
    CASE WHEN NOT readable THEN 'ATENÇÃO'
         WHEN applied=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM history_result
  UNION ALL
  SELECT 41,'FKs originais necessárias para a 018',
    count(*)::text || '/2 FKs simples presentes e validadas',
    CASE WHEN count(*)=2 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_constraint
  WHERE contype='f' AND convalidated AND cardinality(conkey)=1 AND
    ((conrelid=to_regclass('public.treinamentos')
      AND conname='treinamentos_colaborador_id_fkey' AND confrelid=to_regclass('public.colaboradores'))
    OR (conrelid=to_regclass('public.matriz_treinamentos')
      AND conname='matriz_treinamentos_funcao_id_fkey' AND confrelid=to_regclass('public.funcoes')))
  UNION ALL
  SELECT 42,'Trigger de status necessário para a 020',
    count(*)::text || '/1 trigger habilitado',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_trigger
  WHERE tgrelid=to_regclass('public.documentos') AND tgname='trg_documento_status'
    AND NOT tgisinternal AND tgenabled='O'
  UNION ALL
  SELECT 43,'RLS: treinamentos/matriz/tipos',
    count(*)::text || '/3 tabelas com RLS habilitada',
    CASE WHEN count(*)=3 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_class WHERE relrowsecurity AND oid IN
    (to_regclass('public.treinamentos'),to_regclass('public.matriz_treinamentos'),to_regclass('public.treinamento_tipos'))
  UNION ALL
  SELECT 44,'Baseline: policies de treinamentos/matriz/tipos',
    count(*)::text || '/5 policies esperadas presentes',
    CASE WHEN count(*)=5 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='public' AND
    ((tablename='treinamentos' AND policyname IN ('treinamentos_select','treinamentos_write'))
      OR (tablename='matriz_treinamentos' AND policyname IN ('matriz_select','matriz_write'))
      OR (tablename='treinamento_tipos' AND policyname='treinamento_tipos_read'))
  UNION ALL
  SELECT 45,'Storage: inventário de policies',
    count(*)::text || ' policies; ' ||
    count(*) FILTER (WHERE policyname IN ('documentos_storage_select','documentos_storage_insert',
      'documentos_storage_update','documentos_storage_delete'))::text ||
    '/4 policies legadas de documentos; revisar definições antes da 020',
    'ATENÇÃO' FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
  UNION ALL
  SELECT 46,'Grants de tabelas/colunas relacionadas',
    (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name IN
       ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos'))::text ||
    ' grants de tabela; ' ||
    (SELECT count(*) FROM information_schema.column_privileges
     WHERE table_schema='public' AND table_name IN
       ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos'))::text ||
    ' grants de coluna; comparar com baseline 001–017 e log do executor',
    'ATENÇÃO'
  UNION ALL
  SELECT ord,label,
    CASE WHEN n IS NULL AND ord IN (108,116,122) AND (SELECT ok FROM ready)
           THEN 'Origin confiável obrigatório não informado/inválido'
         WHEN n IS NULL THEN 'Não verificável: estruturas/privilégios insuficientes'
         WHEN ord=113 THEN n::text || '/1 bucket encontrado'
         WHEN ord=114 THEN CASE WHEN n>0 THEN 'Público: estado esperado antes da 020'
                               ELSE 'Bucket já privado: revisar estado/histórico antes do corte' END
         WHEN ord=115 AND n>0 THEN 'Ajuste de limite/MIME necessário na 020'
         WHEN ord=121 THEN n::text || ' objeto(s) sem referência atual; preservados, sem limpeza'
         WHEN ord=122 THEN n::text || ' referência(s) diferente(s); possível substituição: ambos os objetos precisam existir'
         ELSE n::text || CASE WHEN blocking THEN ' ocorrência(s) incompatível(is)' ELSE ' registro(s)' END END,
    CASE WHEN n IS NULL AND ord IN (108,116,122) AND (SELECT ok FROM ready) THEN 'BLOQUEIO'
         WHEN n IS NULL THEN 'BLOQUEIO'
         WHEN ord=113 AND n<>1 THEN 'BLOQUEIO'
         WHEN blocking AND n>0 THEN 'BLOQUEIO'
         WHEN ord=114 AND n=0 THEN 'ATENÇÃO'
         WHEN ord=115 AND n>0 THEN 'ATENÇÃO'
         WHEN ord IN (121,122) AND n>0 THEN 'ATENÇÃO'
         ELSE 'OK' END FROM data_results
),
summary AS (
  SELECT 999 AS ord,'Resumo: pós-019 / pré-020' AS label,
    count(*) FILTER (WHERE status='BLOQUEIO')::text || ' bloqueio(s); ' ||
    count(*) FILTER (WHERE status='ATENÇÃO')::text ||
    ' atenção(ões). Ausência de vestígios não substitui revisão de grants/logs.' AS result,
    CASE WHEN bool_or(status='BLOQUEIO') THEN 'BLOQUEIO'
         WHEN bool_or(status='ATENÇÃO') THEN 'ATENÇÃO' ELSE 'OK' END AS status
  FROM report
)
SELECT label AS "CHECK",result AS "RESULTADO",status AS "STATUS"
FROM (SELECT * FROM report UNION ALL SELECT * FROM summary) consolidated
ORDER BY ord,label;


-- Known operator baseline immediately before the failed 020. Counts alone do not
-- prove identity preservation: review inventories/snapshot and executor logs too.
WITH actual AS (
 SELECT (SELECT count(*) FROM public.documentos) documentos,
        (SELECT count(*) FROM public.documentos WHERE arquivo_url IS NOT NULL) legacy_references,
        (SELECT count(*) FROM public.documentos WHERE arquivo_path IS NOT NULL) canonical_references,
        (SELECT count(*) FROM public.documentos WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL) pending_backfill,
        (SELECT count(*) FROM storage.objects WHERE bucket_id='documentos') objects
), checks AS (
 SELECT v.* FROM actual a CROSS JOIN LATERAL (VALUES
  ('documentos',a.documentos,12),('legacy_references',a.legacy_references,4),
  ('canonical_references',a.canonical_references,0),('pending_backfill',a.pending_backfill,4),
  ('objects',a.objects,4)) v(check_name,actual,expected)
)
SELECT *, CASE WHEN actual=expected THEN 'OK' ELSE 'BLOQUEIO: divergiu do baseline; investigar' END status FROM checks;

-- SQL role used for the retry MUST match this preflight's role.
SELECT current_user, session_user, version(),
 current_setting('shared_preload_libraries',true) shared_preload_libraries,
 current_setting('session_preload_libraries',true) session_preload_libraries,
 current_setting('supautils.policy_grants',true) policy_grants;

WITH relations AS (
 SELECT c.*, n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass,'public.documentos'::regclass)
), rights AS (
 SELECT nspname||'.'||relname relation, pg_get_userbyid(relowner) owner, relrowsecurity,
  has_table_privilege(oid,'SELECT') can_select,
  has_table_privilege(oid,'UPDATE') can_update,
  (has_table_privilege(oid,'UPDATE') OR has_table_privilege(oid,'DELETE') OR has_table_privilege(oid,'TRUNCATE')) can_lock_share_row_exclusive,
  (NOT relrowsecurity) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
    OR (NOT relforcerowsecurity AND pg_has_role(relowner,'USAGE')) unrestricted_rls_read,
  pg_has_role(relowner,'USAGE') owner_rights
 FROM relations
)
SELECT *, CASE WHEN can_select AND unrestricted_rls_read AND can_lock_share_row_exclusive
 AND (relation='storage.objects' OR can_update)
 AND (relation<>'storage.objects' OR relrowsecurity)
 AND (relation<>'public.documentos' OR owner_rights)
 THEN 'OK' ELSE 'BLOQUEIO' END status FROM rights;

-- Core PostgreSQL requires ownership for policies; hosted supautils can grant
-- CREATE / ALTER / DROP POLICY separately. This is NOT an ALTER TABLE grant.
WITH config AS (
 SELECT nullif(current_setting('supautils.policy_grants',true),'')::jsonb grants
), capability AS (
 SELECT pg_has_role(c.relowner,'USAGE')
 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 OR coalesce((grants -> current_user) ? 'storage.objects',false) supported
 FROM pg_class c CROSS JOIN config WHERE c.oid='storage.objects'::regclass
)
SELECT 'CREATE POLICY / DROP POLICY storage.objects' operation, supported,
 CASE WHEN supported THEN 'OK: catalog/config evidence; hosted hook required'
 ELSE 'BLOQUEIO: no policy ownership/grant evidence; resolve with Supabase, never change ownership' END status
FROM capability;

SELECT 'engmarq_private: USAGE / CREATE' operation,
 has_schema_privilege('engmarq_private','USAGE') can_use,
 has_schema_privilege('engmarq_private','CREATE') can_create,
 CASE WHEN has_schema_privilege('engmarq_private','USAGE') AND has_schema_privilege('engmarq_private','CREATE')
 THEN 'OK' ELSE 'BLOQUEIO' END status;
-- Existing functions must be owned/manageable by the retry role. Do not drop
-- unknown signatures/dependencies just to bypass a collision.
SELECT p.oid::regprocedure function_name, pg_has_role(p.proowner,'USAGE') can_replace,
 CASE WHEN pg_has_role(p.proowner,'USAGE') THEN 'OK: review existing definition'
 ELSE 'BLOQUEIO: incompatible function owner' END status
FROM pg_proc p WHERE p.oid IN (
 to_regprocedure('engmarq_private.can_access_documento(text,boolean)'),
 to_regprocedure('engmarq_private.guard_documento_reference()'));

SELECT p.oid::regprocedure function_name, pg_get_userbyid(p.proowner) owner,
 pg_get_functiondef(p.oid) definition
FROM pg_proc p WHERE p.oid IN (
 to_regprocedure('engmarq_private.can_access_documento(text,boolean)'),
 to_regprocedure('engmarq_private.guard_documento_reference()'));
SELECT tgname,tgenabled,pg_get_triggerdef(oid) definition FROM pg_trigger
WHERE tgrelid='public.documentos'::regclass AND NOT tgisinternal;
SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='documentos';
-- Metadata inventory only: no signed URLs, no files changed. Keep results private.
SELECT id,name,metadata->>'mimetype' mimetype,metadata->>'size' size
FROM storage.objects WHERE bucket_id='documentos' ORDER BY name;

-- Consolidated final result. Re-evaluate the original report without persisting
-- results in tables, session variables, functions or temporary objects.
-- Baseline counts require unrestricted SELECT evidence; never treat RLS-filtered
-- counts as proof of preservation. Detailed outputs above remain available.
WITH
config AS (SELECT current_setting('engmarq.storage_origin',true) AS storage_origin),
required(relation, columns) AS (
  VALUES
    ('public.treinamentos', ARRAY['empresa_id','colaborador_id','treinamento_tipo_id','certificado_url']),
    ('public.matriz_treinamentos', ARRAY['empresa_id','funcao_id','treinamento_tipo_id']),
    ('public.colaboradores', ARRAY['id','empresa_id']),
    ('public.funcoes', ARRAY['id','empresa_id']),
    ('public.treinamento_tipos', ARRAY['id']),
    ('public.documentos', ARRAY['id','empresa_id','arquivo_url','arquivo_path']),
    ('public.empresas', ARRAY['id']),
    ('public.user_profiles', ARRAY['id','empresa_id','role','active']),
    ('public.vw_dashboard_treinamentos', ARRAY['empresa_id']),
    ('storage.buckets', ARRAY['id','public','file_size_limit','allowed_mime_types']),
    ('storage.objects', ARRAY['bucket_id','name','metadata'])
),
structures AS (
  SELECT r.relation, c.oid,
    c.oid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(r.columns) x(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname=x.column_name
          AND a.attnum>0 AND NOT a.attisdropped
      )
    ) AS complete,
    CASE WHEN c.oid IS NULL THEN false ELSE
      has_table_privilege(current_user,c.oid,'SELECT')
      AND (NOT c.relrowsecurity
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                   WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
        OR (NOT c.relforcerowsecurity AND pg_has_role(current_user,c.relowner,'USAGE')))
    END AS unrestricted_read
  FROM required r
  LEFT JOIN pg_catalog.pg_class c ON c.oid=to_regclass(r.relation)
),
ready AS (
  SELECT bool_and(complete AND unrestricted_read)
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)')
      AND provolatile='i' AND prorettype='text'::regtype) AS ok FROM structures
),
history AS (
  SELECT c.oid,
    CASE WHEN c.oid IS NULL THEN false ELSE
      has_table_privilege(current_user,c.oid,'SELECT')
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                  WHERE attrelid=c.oid AND attname='version'
                    AND attnum>0 AND NOT attisdropped)
      AND (NOT c.relrowsecurity
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
                   WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
        OR (NOT c.relforcerowsecurity AND pg_has_role(current_user,c.relowner,'USAGE')))
    END AS readable
  FROM (SELECT to_regclass('supabase_migrations.schema_migrations') AS oid) h
  LEFT JOIN pg_catalog.pg_class c ON c.oid=h.oid
),
history_result AS (
  -- SQL dinÃ¢mico de leitura evita referenciar uma tabela inexistente no parser.
  SELECT readable, CASE WHEN readable THEN
    ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM supabase_migrations.schema_migrations
       WHERE version::text IN (''018'',''18'',''020'',''20'')',
      true,false,'')))[1])::text::bigint
    ELSE NULL END AS applied
  FROM history
),
data_queries(ord,label,query_text,blocking) AS (
  VALUES
  (100,'Treinamentos: colaborador de outro tenant ou inexistente',
   $q$SELECT count(*) AS n FROM public.treinamentos t
      LEFT JOIN public.colaboradores c ON c.id=t.colaborador_id AND c.empresa_id=t.empresa_id
      WHERE c.id IS NULL$q$,true),
  (101,'Matriz: função de outro tenant ou inexistente',
   $q$SELECT count(*) AS n FROM public.matriz_treinamentos m
      LEFT JOIN public.funcoes f ON f.id=m.funcao_id AND f.empresa_id=m.empresa_id
      WHERE f.id IS NULL$q$,true),
  (102,'Treinamentos: certificate paths inválidos',
   $q$SELECT count(*) AS n FROM public.treinamentos
      WHERE certificado_url IS NOT NULL AND
        (empresa_id IS NULL OR certificado_url !~
          ('^' || empresa_id::text || '/certificados/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true),
  (103,'Treinamentos: tipo de treinamento inexistente',
   $q$SELECT count(*) AS n FROM public.treinamentos t
      LEFT JOIN public.treinamento_tipos tt ON tt.id=t.treinamento_tipo_id
      WHERE tt.id IS NULL$q$,true),
  (104,'Matriz: tipo de treinamento inexistente',
   $q$SELECT count(*) AS n FROM public.matriz_treinamentos m
      LEFT JOIN public.treinamento_tipos tt ON tt.id=m.treinamento_tipo_id
      WHERE tt.id IS NULL$q$,true),
  (105,'Registros de Documentos',
   $q$SELECT count(*) AS n FROM public.documentos$q$,false),
  (106,'Referências legadas não nulas',
   $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_url IS NOT NULL$q$,false),
  (107,'Referências legadas: formato, bucket ou tenant inválidos',
   $q$SELECT count(*) AS n FROM public.documentos
      WHERE arquivo_url IS NOT NULL AND
        (empresa_id IS NULL OR arquivo_url !~
          ('^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/documentos/' ||
           empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true),
  (109,'Objetos no bucket documentos',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'$q$,false),
  (110,'Objetos: path ou empresa inexistente/inválidos',
   $q$SELECT count(*) AS n FROM storage.objects o
      WHERE bucket_id='documentos' AND
        (name IS NULL OR name !~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'
         OR NOT EXISTS (SELECT 1 FROM public.empresas e
                         WHERE e.id::text=split_part(o.name,'/',1)))$q$,true),
  (111,'Objetos: MIME ausente ou incompatível com a 020',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'
      AND (metadata->>'mimetype' IS NULL OR metadata->>'mimetype' NOT IN
        ('application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'image/jpeg','image/png'))$q$,true),
  (112,'Objetos: tamanho ausente, inválido ou acima de 10 MB',
   $q$SELECT count(*) AS n FROM storage.objects WHERE bucket_id='documentos'
      AND CASE WHEN coalesce(metadata->>'size','') !~ '^[0-9]+$' THEN true
               ELSE (metadata->>'size')::numeric>10485760 END$q$,true),
  (113,'Bucket documentos: existência',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos'$q$,false),
  (114,'Bucket documentos: público',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos' AND public IS DISTINCT FROM false$q$,false),
  (115,'Bucket documentos: limite/MIME diferentes da configuração final',
   $q$SELECT count(*) AS n FROM storage.buckets WHERE id='documentos' AND
      (file_size_limit IS DISTINCT FROM 10485760
       OR allowed_mime_types IS NULL
       OR NOT (allowed_mime_types @> ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']
         AND allowed_mime_types <@ ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png']))$q$,false)
  UNION ALL
  SELECT 117,'Referências canônicas não nulas',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NOT NULL$q$,false
  UNION ALL
  SELECT 118,'Referências pendentes de backfill',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL$q$,false
  UNION ALL
  SELECT 119,'Paths canônicos inválidos ou de outro tenant',
    $q$SELECT count(*) AS n FROM public.documentos WHERE arquivo_path IS NOT NULL AND
      (empresa_id IS NULL OR arquivo_path !~ ('^' || empresa_id::text ||
      '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$'))$q$,true
  UNION ALL
  SELECT 120,'Referências canônicas sem objeto',
    $q$SELECT count(*) AS n FROM public.documentos d WHERE arquivo_path IS NOT NULL AND
      NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=d.arquivo_path)$q$,true
  UNION ALL
  SELECT 123,'Certificados de treinamento sem objeto',
    $q$SELECT count(*) AS n FROM public.treinamentos t WHERE certificado_url IS NOT NULL AND
      NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos' AND o.name=t.certificado_url)$q$,true
  UNION ALL
  SELECT 121,'Objetos existentes sem referência atual',
    $q$SELECT count(*) AS n FROM storage.objects o WHERE o.bucket_id='documentos' AND NOT EXISTS (
      SELECT 1 FROM public.documentos d WHERE d.arquivo_path=o.name OR
      substring(d.arquivo_url FROM '^https://[^/]+/storage/v1/object/public/documentos/(.*)$')=o.name
    ) AND NOT EXISTS (SELECT 1 FROM public.treinamentos t WHERE t.certificado_url=o.name)$q$,false
  UNION ALL
  SELECT 122,'Referências duplas com identidades diferentes',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format($q$SELECT count(*) AS n FROM public.documentos
        WHERE arquivo_path IS NOT NULL AND arquivo_url IS NOT NULL
        AND left(arquivo_url,length(%L))=%L
        AND arquivo_path<>substr(arquivo_url,length(%L)+1)$q$,
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/')
    END,false FROM config
  UNION ALL
  SELECT 116,'Referências legadas: origin diferente do projeto confiável',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format('SELECT count(*) AS n FROM public.documentos
        WHERE arquivo_url IS NOT NULL AND left(arquivo_url,length(%L))<>%L',
        storage_origin || '/storage/v1/object/public/documentos/',
        storage_origin || '/storage/v1/object/public/documentos/')
    END,true FROM config
  UNION ALL
  SELECT 108,'Referências legadas aceitas pelo helper sem objeto',
    CASE WHEN storage_origin ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
      format($q$SELECT count(*) AS n FROM public.documentos d WHERE d.arquivo_url IS NOT NULL
        AND d.arquivo_url ~ ('^https://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/documentos/' ||
          d.empresa_id::text || '/(certificados/)?[A-Za-z0-9_-]+\.[A-Za-z0-9]+$')
        AND left(d.arquivo_url,length(%L))=%L
        AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='documentos'
          AND o.name=engmarq_private.documento_legacy_path(d.arquivo_url,d.empresa_id,%L))$q$,
          storage_origin || '/storage/v1/object/public/documentos/',
          storage_origin || '/storage/v1/object/public/documentos/',storage_origin)
    END,true FROM config
),
data_results AS MATERIALIZED (
  SELECT q.*, CASE WHEN ready.ok AND q.query_text IS NOT NULL THEN
    ((xpath('/table/row/n/text()',query_to_xml(q.query_text,true,false,'')))[1])::text::bigint
    ELSE NULL END AS n
  FROM data_queries q CROSS JOIN ready
),
footprints(ord,label,n) AS (
  SELECT 30,'018: constraints criadas',count(*) FROM pg_catalog.pg_constraint
  WHERE (conrelid=to_regclass('public.colaboradores') AND conname='colaboradores_empresa_id_id_key')
     OR (conrelid=to_regclass('public.treinamentos') AND conname='treinamentos_certificado_path_check')
  UNION ALL
  SELECT 31,'018: funções criadas',count(*) FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='engmarq_private'
    AND p.proname IN ('guard_treinamento_write','can_access_certificado')
  UNION ALL
  SELECT 32,'018: triggers criados',count(*) FROM pg_catalog.pg_trigger
  WHERE NOT tgisinternal AND tgname='guard_treinamento_write'
  UNION ALL
  SELECT 33,'018: policies de certificados',count(*) FROM pg_catalog.pg_policies
  WHERE schemaname='storage' AND policyname IN
    ('certificados_select_guard','certificados_insert_guard','certificados_update_guard','certificados_delete_guard')
  UNION ALL
  SELECT 34,'018: view com security_invoker=true',count(*) FROM pg_catalog.pg_class
  WHERE oid=to_regclass('public.vw_dashboard_treinamentos')
    AND 'security_invoker=true'=ANY(coalesce(reloptions,ARRAY[]::text[]))
  UNION ALL
  SELECT 35,'018: FKs compostas ou alteradas',count(*) FROM pg_catalog.pg_constraint
  WHERE contype='f' AND
    ((conrelid=to_regclass('public.treinamentos') AND conname='treinamentos_colaborador_id_fkey')
      OR (conrelid=to_regclass('public.matriz_treinamentos') AND conname='matriz_treinamentos_funcao_id_fkey'))
    AND cardinality(conkey)<>1
  UNION ALL
  SELECT 36,'Policies inesperadas: treinamentos/matriz/tipos',count(*) FROM pg_catalog.pg_policies
  WHERE schemaname='public' AND (
    (tablename='treinamentos' AND policyname NOT IN ('treinamentos_select','treinamentos_write'))
    OR (tablename='matriz_treinamentos' AND policyname NOT IN ('matriz_select','matriz_write'))
    OR (tablename='treinamento_tipos' AND policyname<>'treinamento_tipos_read'))

),
report AS (
  SELECT 10 AS ord, 'Estrutura: ' || relation AS label,
    CASE WHEN NOT complete THEN 'Tabela/view/colunas necessárias ausentes'
         WHEN NOT unrestricted_read THEN 'Leitura integral não comprovada: privilégios/RLS'
         ELSE 'Estrutura presente; leitura integral disponível' END AS result,
    CASE WHEN complete AND unrestricted_read THEN 'OK' ELSE 'BLOQUEIO' END AS status
  FROM structures
  UNION ALL
  SELECT 20,'Pré-requisito 017: helper e schema privado',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='engmarq_private' AND p.proname='can_access_catalogos'
        AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, boolean'
        AND p.prorettype='boolean'::regtype AND p.prosecdef
    ) THEN 'Helper presente com assinatura e SECURITY DEFINER esperados'
      ELSE 'Helper ausente ou estrutura incompatível' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='engmarq_private' AND p.proname='can_access_catalogos'
        AND pg_catalog.oidvectortypes(p.proargtypes)='uuid, boolean'
        AND p.prorettype='boolean'::regtype AND p.prosecdef
    ) THEN 'OK' ELSE 'BLOQUEIO' END
  UNION ALL
  SELECT 21,'019: constraint de path validada',count(*)::text || '/1 constraint CHECK validada',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_constraint WHERE conrelid=to_regclass('public.documentos')
    AND conname='documentos_arquivo_path_check' AND contype='c' AND convalidated
  UNION ALL
  SELECT 22,'019: helper de conversão',count(*)::text || '/1 helper IMMUTABLE com retorno text',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)')
    AND prorettype='text'::regtype AND provolatile='i'
  UNION ALL
  SELECT 23,'020: funções já existentes',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='engmarq_private' AND p.proname IN ('can_access_documento','guard_documento_reference')
  UNION ALL
  SELECT 24,'020: trigger de referência já existente',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_trigger WHERE tgrelid=to_regclass('public.documentos')
    AND NOT tgisinternal AND tgname='guard_documento_reference'
  UNION ALL
  SELECT 25,'020: guards de Storage já existentes',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('documentos_tenant_select_guard','documentos_tenant_insert_guard',
      'documentos_tenant_update_guard','documentos_tenant_delete_guard')
  UNION ALL
  SELECT 26,'020: policies já referenciam helper novo',count(*)::text || ' ocorrência(s)',
    CASE WHEN count(*)=0 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (coalesce(qual,'') LIKE '%can_access_documento%' OR coalesce(with_check,'') LIKE '%can_access_documento%')
  UNION ALL
  SELECT ord,label,n::text || ' ocorrência(s)',
    CASE WHEN n=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM footprints
  UNION ALL
  SELECT 40,'Histórico de migrations: 018/020',
    CASE WHEN NOT readable THEN 'Indisponível/inacessível; avaliar vestígios e log do executor'
         ELSE applied::text || ' registro(s) de aplicação da 018/020' END,
    CASE WHEN NOT readable THEN 'ATENÇÃO'
         WHEN applied=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM history_result
  UNION ALL
  SELECT 41,'FKs originais necessárias para a 018',
    count(*)::text || '/2 FKs simples presentes e validadas',
    CASE WHEN count(*)=2 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_constraint
  WHERE contype='f' AND convalidated AND cardinality(conkey)=1 AND
    ((conrelid=to_regclass('public.treinamentos')
      AND conname='treinamentos_colaborador_id_fkey' AND confrelid=to_regclass('public.colaboradores'))
    OR (conrelid=to_regclass('public.matriz_treinamentos')
      AND conname='matriz_treinamentos_funcao_id_fkey' AND confrelid=to_regclass('public.funcoes')))
  UNION ALL
  SELECT 42,'Trigger de status necessário para a 020',
    count(*)::text || '/1 trigger habilitado',
    CASE WHEN count(*)=1 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_trigger
  WHERE tgrelid=to_regclass('public.documentos') AND tgname='trg_documento_status'
    AND NOT tgisinternal AND tgenabled='O'
  UNION ALL
  SELECT 43,'RLS: treinamentos/matriz/tipos',
    count(*)::text || '/3 tabelas com RLS habilitada',
    CASE WHEN count(*)=3 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_class WHERE relrowsecurity AND oid IN
    (to_regclass('public.treinamentos'),to_regclass('public.matriz_treinamentos'),to_regclass('public.treinamento_tipos'))
  UNION ALL
  SELECT 44,'Baseline: policies de treinamentos/matriz/tipos',
    count(*)::text || '/5 policies esperadas presentes',
    CASE WHEN count(*)=5 THEN 'OK' ELSE 'BLOQUEIO' END
  FROM pg_catalog.pg_policies WHERE schemaname='public' AND
    ((tablename='treinamentos' AND policyname IN ('treinamentos_select','treinamentos_write'))
      OR (tablename='matriz_treinamentos' AND policyname IN ('matriz_select','matriz_write'))
      OR (tablename='treinamento_tipos' AND policyname='treinamento_tipos_read'))
  UNION ALL
  SELECT 45,'Storage: inventário de policies',
    count(*)::text || ' policies; ' ||
    count(*) FILTER (WHERE policyname IN ('documentos_storage_select','documentos_storage_insert',
      'documentos_storage_update','documentos_storage_delete'))::text ||
    '/4 policies legadas de documentos; revisar definições antes da 020',
    'ATENÇÃO' FROM pg_catalog.pg_policies WHERE schemaname='storage' AND tablename='objects'
  UNION ALL
  SELECT 46,'Grants de tabelas/colunas relacionadas',
    (SELECT count(*) FROM information_schema.table_privileges
     WHERE table_schema='public' AND table_name IN
       ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos'))::text ||
    ' grants de tabela; ' ||
    (SELECT count(*) FROM information_schema.column_privileges
     WHERE table_schema='public' AND table_name IN
       ('treinamentos','matriz_treinamentos','treinamento_tipos','vw_dashboard_treinamentos'))::text ||
    ' grants de coluna; comparar com baseline 001–017 e log do executor',
    'ATENÇÃO'
  UNION ALL
  SELECT ord,label,
    CASE WHEN n IS NULL AND ord IN (108,116,122) AND (SELECT ok FROM ready)
           THEN 'Origin confiável obrigatório não informado/inválido'
         WHEN n IS NULL THEN 'Não verificável: estruturas/privilégios insuficientes'
         WHEN ord=113 THEN n::text || '/1 bucket encontrado'
         WHEN ord=114 THEN CASE WHEN n>0 THEN 'Público: estado esperado antes da 020'
                               ELSE 'Bucket já privado: revisar estado/histórico antes do corte' END
         WHEN ord=115 AND n>0 THEN 'Ajuste de limite/MIME necessário na 020'
         WHEN ord=121 THEN n::text || ' objeto(s) sem referência atual; preservados, sem limpeza'
         WHEN ord=122 THEN n::text || ' referência(s) diferente(s); possível substituição: ambos os objetos precisam existir'
         ELSE n::text || CASE WHEN blocking THEN ' ocorrência(s) incompatível(is)' ELSE ' registro(s)' END END,
    CASE WHEN n IS NULL AND ord IN (108,116,122) AND (SELECT ok FROM ready) THEN 'BLOQUEIO'
         WHEN n IS NULL THEN 'BLOQUEIO'
         WHEN ord=113 AND n<>1 THEN 'BLOQUEIO'
         WHEN blocking AND n>0 THEN 'BLOQUEIO'
         WHEN ord=114 AND n=0 THEN 'ATENÇÃO'
         WHEN ord=115 AND n>0 THEN 'ATENÇÃO'
         WHEN ord IN (121,122) AND n>0 THEN 'ATENÇÃO'
         ELSE 'OK' END FROM data_results
),
baseline(ord,label,n,expected) AS (
 SELECT v.* FROM (SELECT
   (SELECT count(*) FROM public.documentos) documentos,
   (SELECT count(*) FROM public.documentos WHERE arquivo_url IS NOT NULL) legacy_references,
   (SELECT count(*) FROM public.documentos WHERE arquivo_path IS NOT NULL) canonical_references,
   (SELECT count(*) FROM public.documentos WHERE arquivo_path IS NULL AND arquivo_url IS NOT NULL) pending_backfill,
   (SELECT count(*) FROM storage.objects WHERE bucket_id='documentos') objects
 ) a CROSS JOIN LATERAL (VALUES
  (200,'Baseline: documentos',a.documentos,12),
  (201,'Baseline: legacy_references',a.legacy_references,4),
  (202,'Baseline: canonical_references',a.canonical_references,0),
  (203,'Baseline: pending_backfill',a.pending_backfill,4),
  (204,'Baseline: objetos',a.objects,4)) v(ord,label,n,expected)
),
relation_rights AS (
 SELECT c.oid,n.nspname||'.'||c.relname relation,c.relrowsecurity,
  has_table_privilege(c.oid,'SELECT') can_select,
  has_table_privilege(c.oid,'UPDATE') can_update,
  has_table_privilege(c.oid,'TRIGGER') can_trigger,
  (has_table_privilege(c.oid,'UPDATE') OR has_table_privilege(c.oid,'DELETE')
    OR has_table_privilege(c.oid,'TRUNCATE')) can_lock,
  (NOT c.relrowsecurity) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls))
    OR (NOT c.relforcerowsecurity AND pg_has_role(c.relowner,'USAGE')) unrestricted_read,
  pg_has_role(c.relowner,'USAGE') owner_rights
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid IN (to_regclass('storage.objects'),to_regclass('storage.buckets'),to_regclass('public.documentos'))
),
policy_capability AS (
 SELECT pg_has_role(c.relowner,'USAGE')
 OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper)
 OR coalesce((nullif(current_setting('supautils.policy_grants',true),'')::jsonb -> current_user)
   ? 'storage.objects',false) supported
 FROM pg_class c WHERE c.oid=to_regclass('storage.objects')
),
extra_report AS (
 SELECT ord,label,n::text||' / esperado '||expected::text result,
  CASE WHEN n=expected AND (SELECT ok FROM ready) THEN 'OK' ELSE 'BLOQUEIO' END status
 FROM baseline
 UNION ALL
 SELECT 210,'Storage: RLS ativo em storage.objects',
  CASE WHEN EXISTS (SELECT 1 FROM relation_rights WHERE relation='storage.objects' AND relrowsecurity)
   THEN 'RLS ativo; nenhuma alteração de RLS é executada' ELSE 'RLS ausente/desativado' END,
  CASE WHEN EXISTS (SELECT 1 FROM relation_rights WHERE relation='storage.objects' AND relrowsecurity)
   THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL
 SELECT 211,'Bucket documentos: estado pré-cutover',
  count(*) FILTER (WHERE public IS TRUE)::text||'/1 bucket ainda público; esperado após rollback',
  CASE WHEN count(*)=1 AND bool_and(public IS TRUE) THEN 'OK' ELSE 'BLOQUEIO' END
 FROM storage.buckets WHERE id='documentos'
 UNION ALL
 SELECT 212,'Bucket documentos: configuração pré-cutover',
  coalesce((SELECT 'public='||coalesce(public::text,'NULL')||'; file_size_limit='||coalesce(file_size_limit::text,'NULL')
   ||'; allowed_mime_types='||coalesce(allowed_mime_types::text,'NULL') FROM storage.buckets WHERE id='documentos'),'Bucket ausente')
  ||'; comparar com snapshot anterior: limite/MIME exatos pré-020 não foram informados',
  'ATENÇÃO'
 UNION ALL
 SELECT 213,'Storage: quatro policies legadas de documentos',
  count(*)::text||'/4 policies presentes; comandos, papel authenticated e modo permissivo esperados',
  CASE WHEN count(*)=4 AND bool_and(polpermissive AND polroles=ARRAY['authenticated'::regrole::oid]
    AND polcmd=CASE polname WHEN 'documentos_storage_select' THEN 'r'::"char"
     WHEN 'documentos_storage_insert' THEN 'a'::"char" WHEN 'documentos_storage_update' THEN 'w'::"char"
     ELSE 'd'::"char" END) THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_policy WHERE polrelid=to_regclass('storage.objects') AND polname IN
  ('documentos_storage_select','documentos_storage_insert','documentos_storage_update','documentos_storage_delete')
 UNION ALL
 SELECT 214,'Storage: definições de policies pré-cutover',
  'Revisar qual/with_check do resultado detalhado contra a 009 e snapshot anterior; nomes/contagens não comprovam equivalência',
  'ATENÇÃO'
 UNION ALL
 SELECT 220,'Permissões: SELECT integral em '||relation,
  'SELECT='||can_select::text||'; leitura sem filtro RLS='||unrestricted_read::text,
  CASE WHEN can_select AND unrestricted_read THEN 'OK' ELSE 'BLOQUEIO' END FROM relation_rights
 UNION ALL
 SELECT 221,'Permissões: LOCK SHARE ROW EXCLUSIVE em '||relation,
  'UPDATE/DELETE/TRUNCATE='||can_lock::text||'; nenhum lock adquirido pelo preflight',
  CASE WHEN can_lock THEN 'OK' ELSE 'BLOQUEIO' END FROM relation_rights
 UNION ALL
 SELECT 222,'Permissões: UPDATE em '||relation,
  'UPDATE='||can_update::text||'; acesso sem filtro RLS='||unrestricted_read::text,
  CASE WHEN can_update AND unrestricted_read THEN 'OK' ELSE 'BLOQUEIO' END
 FROM relation_rights WHERE relation IN ('storage.buckets','public.documentos')
 UNION ALL
 SELECT 223,'Permissões: ALTER/DROP/CREATE TRIGGER public.documentos',
  'Owner='||owner_rights::text||'; TRIGGER='||can_trigger::text,
  CASE WHEN owner_rights AND can_trigger THEN 'OK' ELSE 'BLOQUEIO' END
 FROM relation_rights WHERE relation='public.documentos'
 UNION ALL
 SELECT 224,'Permissões: CREATE POLICY / DROP POLICY storage.objects',
  CASE WHEN supported THEN 'Evidência de owner/superuser ou supautils.policy_grants para '||current_user
   ELSE 'Sem evidência de ownership/autorização específica de policies para '||current_user END,
  CASE WHEN supported THEN 'OK' ELSE 'BLOQUEIO' END FROM policy_capability
 UNION ALL
 SELECT 225,'Permissões: schema '||nspname,
  'USAGE='||has_schema_privilege(oid,'USAGE')::text
   ||CASE WHEN nspname='engmarq_private' THEN '; CREATE='||has_schema_privilege(oid,'CREATE')::text ELSE '' END,
  CASE WHEN has_schema_privilege(oid,'USAGE') AND (nspname<>'engmarq_private' OR has_schema_privilege(oid,'CREATE'))
   THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_namespace WHERE nspname IN ('public','storage','auth','engmarq_private')
 UNION ALL
 SELECT 226,'Permissões: EXECUTE helper da 019',
  CASE WHEN to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)') IS NULL THEN 'Helper ausente'
   ELSE 'EXECUTE='||has_function_privilege(to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)'),'EXECUTE')::text END,
  CASE WHEN coalesce(has_function_privilege(to_regprocedure('engmarq_private.documento_legacy_path(text,uuid,text)'),'EXECUTE'),false)
   THEN 'OK' ELSE 'BLOQUEIO' END
 UNION ALL
 SELECT 227,'Permissões: funções existentes da 020',
  count(*)::text||' funções existentes; '||count(*) FILTER (WHERE NOT pg_has_role(p.proowner,'USAGE'))::text
   ||' sem ownership para REPLACE/GRANT/REVOKE; ausência esperada no rollback',
  CASE WHEN count(*) FILTER (WHERE NOT pg_has_role(p.proowner,'USAGE'))=0 THEN 'OK' ELSE 'BLOQUEIO' END
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='engmarq_private' AND p.proname IN ('can_access_documento','guard_documento_reference')
 UNION ALL
 SELECT 228,'Permissões: autorização hospedada de policies',
  'Catálogo/configuração são evidências; preflight read-only não testa o hook com CREATE/DROP. Usar o mesmo papel SQL na 020',
  'ATENÇÃO'
),
all_checks AS MATERIALIZED (
 SELECT * FROM report UNION ALL SELECT * FROM extra_report
),
totals AS (
 SELECT count(*) FILTER (WHERE status='BLOQUEIO') bloqueios,
        count(*) FILTER (WHERE status='ATENÇÃO') atencoes FROM all_checks
),
final_report AS (
 SELECT * FROM all_checks
 UNION ALL
 SELECT 10000,'TOTAL_BLOQUEIOS',bloqueios::text,
  CASE WHEN bloqueios=0 THEN 'OK' ELSE 'BLOQUEIO' END FROM totals
 UNION ALL
 SELECT 10001,'TOTAL_ATENCOES',atencoes::text,
  CASE WHEN atencoes=0 THEN 'OK' ELSE 'ATENÇÃO' END FROM totals
)
SELECT label AS "CHECK",result AS "RESULTADO",status AS "STATUS"
FROM final_report ORDER BY ord,label;

COMMIT;
