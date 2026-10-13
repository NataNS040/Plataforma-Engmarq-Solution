"""Run on VPS: build or publish one frozen backend with all controls closed.

No database commands, email calls or automatic rollback. Failure stops the script.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

MODE, COMMIT, ARCHIVE_SHA = sys.argv[1:4]
assert MODE in ['build','publish'] and re.fullmatch('[a-f0-9]{40}',COMMIT)
assert re.fullmatch('[a-f0-9]{64}',ARCHIVE_SHA)
os.umask(0o077)
PROD=Path('/opt/engmarq/production')
RELEASE=Path('/opt/engmarq/releases')/COMMIT
ARCHIVE=Path('/root')/('backend-'+COMMIT+'.tar')
TAG='engmarq-api:norveo-'+COMMIT[:12]
OLD='sha256:0a7f99bf9231177d9aec1acce56b1ce130a4e9e343fb58d31283afa5fc7a2fdf'
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()==ARCHIVE_SHA

def run(args,timeout=180):
    p=subprocess.run(args,cwd=PROD,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        (RELEASE/('failure-'+MODE+'.log')).write_text(p.stdout+p.stderr)
        raise RuntimeError('Release step failed; stopped without rollback; protected diagnostic saved')
    return p.stdout

def containers():
    return json.loads(run(['docker','inspect','engmarq-api-1','engmarq-caddy-1']))

before=containers()
api=next(c for c in before if c['Name']=='/engmarq-api-1')
assert api['Image']==OLD and api['State']['Health']['Status']=='healthy'
env=dict(x.split('=',1) for x in api['Config']['Env'] if '=' in x)
assert env['INTERNAL_USER_CREATION_ENABLED']=='false'
if MODE=='build':
    assert not RELEASE.exists()
    RELEASE.mkdir(parents=True,mode=0o700)
    with tarfile.open(ARCHIVE) as tar:
        for member in tar.getmembers():
            destination=(RELEASE/member.name).resolve()
            assert RELEASE.resolve() in destination.parents and member.name.startswith('backend/')
            assert member.isfile() or member.isdir()
        tar.extractall(RELEASE,filter='data')
    output=run(['docker','build','--tag',TAG,str(RELEASE/'backend')],timeout=600)
    (RELEASE/'build.log').write_text(output)
    name='norveo-closed-release-check'
    started=False
    try:
        run(['docker','run','--rm','--detach','--name',name,'--network','none','--read-only',
             '--tmpfs','/tmp:size=32m','--cap-drop','ALL','--security-opt','no-new-privileges:true',
             '--env','INTERNAL_USER_CREATION_ENABLED=false','--env','USER_INVITATIONS_ENABLED=false',TAG])
        started=True
        for _ in range(30):
            check=subprocess.run(['docker','exec',name,'python','-c',"import urllib.request; assert urllib.request.urlopen('http://127.0.0.1:8000/health').status==200"],capture_output=True)
            if check.returncode==0:
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Offline candidate health failed')
    finally:
        if started:
            run(['docker','stop',name])
    result={'commit':COMMIT,'tag':TAG,'image_id':json.loads(run(['docker','image','inspect',TAG]))[0]['Id'],
            'archive_sha256':ARCHIVE_SHA,'offline_health_passed':True}
    (RELEASE/'build-result.json').write_text(json.dumps(result,indent=2))
    assert [(c['Id'],c['State']['StartedAt']) for c in before]==[(c['Id'],c['State']['StartedAt']) for c in containers()]
    print(json.dumps(result))
else:
    built=json.loads((RELEASE/'build-result.json').read_text())
    assert built['commit']==COMMIT and built['archive_sha256']==ARCHIVE_SHA and built['offline_health_passed']
    assert json.loads(run(['docker','image','inspect',TAG]))[0]['Id']==built['image_id']
    backup=Path('/root')/('norveo-predeploy-20261013-'+COMMIT[:12])
    backup.mkdir(mode=0o700)
    for name,path in [('compose.yaml',PROD/'compose.yaml'),('Caddyfile',PROD/'Caddyfile'),
                      ('backend.env',Path('/etc/engmarq/backend.env')),('compose.env',PROD/'.env')]:
        shutil.copyfile(path,backup/name);(backup/name).chmod(0o600)
    (backup/'containers-private.json').write_text(json.dumps(before))
    # Preserve all existing credentials; change only non-secret closed controls.
    file=Path('/etc/engmarq/backend.env')
    lines=file.read_text().splitlines()
    updates={'INTERNAL_USER_CREATION_ENABLED':'false','USER_INVITATIONS_ENABLED':'false',
             'INVITATION_CALLBACK_URL':'https://norveo.com.br/aceitar-convite'}
    lines=[x for x in lines if x.split('=',1)[0] not in updates]
    lines += [k+'='+v for k,v in updates.items()]
    tmp=file.with_suffix('.closed-release-tmp');tmp.write_text('\n'.join(lines)+'\n');tmp.chmod(0o600);tmp.replace(file)
    file=PROD/'.env';lines=file.read_text().splitlines()
    lines=[x for x in lines if x.split('=',1)[0]!='API_IMAGE']+['API_IMAGE='+TAG]
    file.write_text('\n'.join(lines)+'\n');file.chmod(0o600)
    # Keep the published source directory aligned with the image; old source is private rollback.
    (PROD/'backend').rename(backup/'backend-source')
    shutil.copytree(RELEASE/'backend',PROD/'backend')
    run(['docker','compose','config','--quiet'])
    run(['docker','compose','up','-d','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','120','api'])
    check="from app.core.config import Settings; s=Settings(); assert not s.internal_user_creation_enabled and not s.user_invitations_enabled; assert 'https://norveo.com.br' in s.cors_origins"
    run(['docker','compose','exec','-T','api','python','-c',check])
    after=containers();new=next(c for c in after if c['Name']=='/engmarq-api-1')
    assert new['Image']==built['image_id'] and new['State']['Health']['Status']=='healthy'
    old_caddy=next(c for c in before if c['Name']=='/engmarq-caddy-1');new_caddy=next(c for c in after if c['Name']=='/engmarq-caddy-1')
    assert old_caddy['Id']==new_caddy['Id'] and old_caddy['State']['StartedAt']==new_caddy['State']['StartedAt']
    result={**built,'api_healthy':True,'caddy_unchanged':True,'rollback_config_path':str(backup),
            'internal_creation_enabled':False,'user_invitations_enabled':False}
    (RELEASE/'publish-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))
