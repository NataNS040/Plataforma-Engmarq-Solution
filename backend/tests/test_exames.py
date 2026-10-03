import json
from datetime import date, timedelta
import httpx
import pytest
from types import SimpleNamespace
from app.core.errors import AppError
from app.core.config import Settings
from app.services.exames import aso_status, ExamesService
from app.schemas.exames import AsoCreate
from test_security import USER_ID, override_supabase
from test_colaboradores import COMPANY, OTHER, CATALOG, FOREIGN, HEADERS

@pytest.fixture
def exames(app):
    app.state.settings = Settings(_env_file=None, supabase_url='https://project.supabase.co', supabase_anon_key='test-anon-key')
    row = dict(id=CATALOG, empresa_id=COMPANY, tipo_id=CATALOG, colaborador_id=CATALOG,
        titulo='ASO', subtipo_exame='admissional', emissao='2025-01-01', vencimento=None,
        numero=None, observacoes='Apto', resultado_aso=None, exames_realizados=[],
        arquivo_path=f'{COMPANY}/old.pdf', arquivo_url=None, created_at=None, status='vencido',
        tipo=dict(id=CATALOG,nome='ASO',descricao=None,validade_meses=12),colaborador=dict(id=CATALOG,nome='Pessoa'))
    state = dict(role='empresa',active=True,status='ativa',invalid_jwt=False,writes=[],requests=[],row=row,storage=[])
    def handler(req):
        assert req.headers['apikey']=='test-anon-key'
        assert req.headers['authorization']=='Bearer caller-jwt'
        path=req.url.path
        if path=='/auth/v1/user':
            if state['invalid_jwt']: return httpx.Response(401,json={'msg':'invalid'})
            return httpx.Response(200,json=dict(id=USER_ID,email='test@example.com',aud='authenticated',app_metadata={},user_metadata={},created_at='2025-01-01T00:00:00Z'))
        if path=='/rest/v1/user_profiles': return httpx.Response(200,json=[dict(id=USER_ID,empresa_id=COMPANY,full_name='Actor',role=state['role'],active=state['active'])])
        if path=='/rest/v1/empresas': return httpx.Response(200,json=[dict(id=COMPANY,status=state['status'])])
        state['requests'].append(req)
        if path=='/rest/v1/documento_tipos': return httpx.Response(200,json=[dict(id=CATALOG)])
        if path=='/rest/v1/exames_catalogo': return httpx.Response(200,json=[dict(id=1,nome='Audiometria',ordem=1)])
        if path=='/rest/v1/colaboradores':
            assert req.url.params['empresa_id']==f'eq.{COMPANY}'
            return httpx.Response(200,json=[dict(id=CATALOG)] if req.url.params['id']==f'eq.{CATALOG}' else [])
        if path.startswith('/storage/v1/'):
            state['storage'].append(req)
            if '/sign/' in path:
                assert json.loads(req.content)['expiresIn']=='60'
                return httpx.Response(200,json={'signedURL':'/object/sign/documentos/safe.pdf?token=synthetic'})
            return httpx.Response(200,json={'Key':'documentos/safe.pdf','Id':CATALOG})
        assert path=='/rest/v1/documentos'
        if req.method!='POST':
            assert req.url.params['empresa_id']==f'eq.{COMPANY}'
            assert req.url.params['tipo_id']==f'eq.{CATALOG}'
        if req.url.params.get('id')==f'eq.{FOREIGN}': return httpx.Response(200,json=[])
        if state.get('many') and req.method=='GET' and not req.url.params.get('id'):
            offset=int(req.url.params.get('offset',0));limit=int(req.url.params.get('limit',500))
            return httpx.Response(200,json=[row]*max(0,min(limit,600-offset)))
        if req.method in ('POST','PATCH'):
            payload=json.loads(req.content);state['writes'].append(payload)
            if req.method=='POST': assert payload['empresa_id']==COMPANY and payload['tipo_id']==CATALOG
            else: assert 'empresa_id' not in payload
            row.update(payload)
        return httpx.Response(200,json=[row])
    override_supabase(app,handler)
    return state

PAYLOAD=dict(colaborador_id=CATALOG,titulo='ASO',subtipo_exame='admissional',exames_realizados=['Audiometria'])

@pytest.mark.parametrize('role',['empresa','gestor','operacional'])
def test_read_explicit_aso_scope(client,exames,role):
    exames['role']=role
    for path in ['/exames',f'/exames/{CATALOG}',f'/colaboradores/{CATALOG}/exames','/exames/catalogo']:
        r=client.get('/api/v1'+path,headers=HEADERS)
        assert r.status_code==200,r.text
        assert r.headers['cache-control']=='no-store'
    row=client.get(f'/api/v1/exames/{CATALOG}',headers=HEADERS).json()
    assert row['resultado_aso'] is None and row['observacoes']=='Apto' and row['status']=='vigente'

@pytest.mark.parametrize('role',['empresa','gestor'])
def test_create_edit_delete(client,exames,role):
    exames['role']=role
    assert client.post('/api/v1/exames',headers=HEADERS,json=PAYLOAD).status_code==201
    assert client.patch(f'/api/v1/exames/{CATALOG}',headers=HEADERS,json={'resultado_aso':'inapto'}).status_code==200
    assert client.delete(f'/api/v1/exames/{CATALOG}',headers=HEADERS).status_code==204
    assert not exames['storage']

@pytest.mark.parametrize('changes',[dict(role='admin'),dict(active=False),dict(status='suspensa'),dict(status='pendente')])
def test_denied_identity(client,exames,changes):
    exames.update(changes)
    for method,path,data in [('get','/exames',None),('get',f'/exames/{CATALOG}',None),('get','/exames/catalogo',None),
        ('post','/exames',PAYLOAD),('patch',f'/exames/{CATALOG}',{'resultado_aso':'apto'}),('delete',f'/exames/{CATALOG}',None),
        ('get',f'/exames/{CATALOG}/arquivo',None)]:
        response=client.request(method,'/api/v1'+path,headers=HEADERS,**({'json':data} if data else {}))
        assert response.status_code==403,response.text
    assert not exames['writes'] and not exames['storage']

def test_operacional_read_only(client,exames):
    exames['role']='operacional'
    assert client.post('/api/v1/exames',headers=HEADERS,json=PAYLOAD).status_code==403
    assert client.patch(f'/api/v1/exames/{CATALOG}',headers=HEADERS,json={'resultado_aso':'apto'}).status_code==403
    assert client.delete(f'/api/v1/exames/{CATALOG}',headers=HEADERS).status_code==403
    assert client.post(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS|{'Content-Type':'application/pdf'},content=b'%PDF-1.4').status_code==403

def test_anon_and_bad_token(client,exames):
    assert client.get('/api/v1/exames').status_code==401
    exames['invalid_jwt']=True
    assert client.get('/api/v1/exames',headers=HEADERS).status_code==401

@pytest.mark.parametrize('extra',[dict(empresa_id=OTHER),dict(tipo_id=FOREIGN),dict(arquivo_path=f'{OTHER}/a.pdf'),dict(arquivo_url='https://evil.test'),dict(status='vigente')])
def test_forged_fields(client,exames,extra):
    assert client.post('/api/v1/exames',headers=HEADERS,json=PAYLOAD|extra).status_code==422
    assert client.patch(f'/api/v1/exames/{CATALOG}',headers=HEADERS,json=extra).status_code==422
    assert not exames['writes']

def test_foreign_employee_and_record(client,exames):
    assert client.post('/api/v1/exames',headers=HEADERS,json=PAYLOAD|{'colaborador_id':FOREIGN}).status_code==422
    assert client.patch(f'/api/v1/exames/{CATALOG}',headers=HEADERS,json={'colaborador_id':FOREIGN}).status_code==422
    assert client.get(f'/api/v1/colaboradores/{FOREIGN}/exames',headers=HEADERS).status_code==404
    assert client.get(f'/api/v1/exames/{FOREIGN}',headers=HEADERS).status_code==404
    assert client.delete(f'/api/v1/exames/{FOREIGN}',headers=HEADERS).status_code==404
    assert client.get('/api/v1/exames?empresa_id='+OTHER,headers=HEADERS).status_code==422

@pytest.mark.parametrize('payload',[{'subtipo_exame':None},{'resultado_aso':'unknown'},{'exames_realizados':['unknown']},
    {'exames_realizados':['Audiometria','Audiometria']},{'emissao':'2026-02-01','vencimento':'2026-01-01'},{}])
def test_invalid_patch(client,exames,payload):
    assert client.patch(f'/api/v1/exames/{CATALOG}',headers=HEADERS,json=payload).status_code==422

def test_optional_expiry_no_medical_defaults(client,exames):
    row=client.post('/api/v1/exames',headers=HEADERS,json=PAYLOAD).json()
    assert row['emissao'] is None and row['vencimento'] is None and row['resultado_aso'] is None

def test_lists_paginate_without_silent_export_truncation(client,exames):
    exames['many']=True
    r=client.get('/api/v1/exames',headers=HEADERS)
    assert r.status_code==200,r.text
    assert len(r.json())==600
    pages=[q for q in exames['requests'] if q.url.path=='/rest/v1/documentos']
    assert len(pages)==2

@pytest.mark.parametrize('days,expected',[(None,'vigente'),(-1,'vencido'),(0,'vencendo'),(30,'vencendo'),(31,'vigente'),(60,'vigente')])
def test_temporal_status(days,expected):
    today=date(2026,10,3)
    assert aso_status(None if days is None else today+timedelta(days=days),today)==expected

def test_signed_urls_and_upload_use_caller_jwt(client,exames):
    for endpoint in ['arquivo','download']:
        r=client.get(f'/api/v1/exames/{CATALOG}/{endpoint}',headers=HEADERS)
        assert r.status_code==200,r.text
        assert r.json()['expires_in']==60
    r=client.post(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS|{'Content-Type':'application/pdf'},content=b'%PDF-1.4\nsynthetic')
    assert r.status_code==200,r.text
    assert r.json()['arquivo_path'].startswith(COMPANY+'/')

@pytest.mark.parametrize('path',[f'{OTHER}/a.pdf','https://evil.test/a','../a.pdf'])
def test_foreign_path_cannot_be_signed(client,exames,path):
    exames['row']['arquivo_path']=path
    assert client.get(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS).status_code==422
    assert not exames['storage']

def test_legacy_url_and_signed_url_rejected_as_identity(client,exames):
    row=exames['row'];row['arquivo_path']=None
    row['arquivo_url']=f'https://project.supabase.co/storage/v1/object/public/documentos/{COMPANY}/old.pdf'
    assert client.get(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS).status_code==200
    row['arquivo_url']=row['arquivo_url'].replace('/public/','/sign/')+'?token=x'
    assert client.get(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS).status_code==422

@pytest.mark.parametrize('mime,content,expected',[('text/plain',b'%PDF-1.4',422),('application/pdf',b'fake',422),('application/pdf',b'%PDF-'+b'x'*10485760,413)],ids=['mime','bytes','oversize'])
def test_invalid_upload(client,exames,mime,content,expected):
    assert client.post(f'/api/v1/exames/{CATALOG}/arquivo',headers=HEADERS|{'Content-Type':mime},content=content).status_code==expected
    assert not exames['storage']

@pytest.mark.parametrize('status,referenced,removed',[(422,False,True),(422,True,False),(503,False,False)])
def test_upload_compensation_never_deletes_uncertain_or_referenced_objects(status,referenced,removed):
    class Repo:
        deleted=[]
        def get(self,*args): return {'id':CATALOG,'vencimento':None}
        def storage(self): return self
        def upload(self,*args): pass
        def update(self,*args): raise AppError(status,'failed','safe')
        def referenced(self,*args): return referenced
        def remove(self,paths): self.deleted.extend(paths)
    repo=Repo();repo.deleted=[]
    actor=SimpleNamespace(active=True,role='gestor',empresa_id=COMPANY)
    service=ExamesService(repo,actor,'https://project.supabase.co')
    with pytest.raises(AppError): service.upload(CATALOG,b'%PDF-1.4','application/pdf')
    assert bool(repo.deleted)==removed
