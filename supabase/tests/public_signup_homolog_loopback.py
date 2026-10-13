"""Recreate only disposable homologation containers with loopback port binds."""
import json
import subprocess
import sys
HOST = 'npipe:////./pipe/dockerDesktopLinuxEngine'
def docker(*args):
    result = subprocess.run(['docker', '--host', HOST, *args], capture_output=True, text=True, encoding='utf-8', timeout=60)
    if result.returncode:
        raise RuntimeError('Local Docker command failed: ' + args[0])
    return result.stdout
names = ['supabase_auth_norveo-homolog.local'] if '--auth-callback' in sys.argv else ['supabase_kong_norveo-homolog.local', 'supabase_inbucket_norveo-homolog.local', 'supabase_db_norveo-homolog.local']
for name in names:
    spec = json.loads(docker('inspect', name))[0]
    assert spec['Name'] == '/' + name
    networks = spec['NetworkSettings']['Networks']
    assert list(networks) == ['norveo-homolog-local']
    args = ['create', '--name', name, '--network', 'norveo-homolog-local']
    for port, bindings in (spec['HostConfig']['PortBindings'] or {}).items():
        assert len(bindings) == 1
        args += ['--publish', '127.0.0.1:' + bindings[0]['HostPort'] + ':' + port]
    for mount in spec['Mounts']:
        assert mount['Type'] in ('volume', 'bind')
        source = mount.get('Name') if mount['Type'] == 'volume' else mount['Source']
        args += ['--volume', source + ':' + mount['Destination'] + ('' if mount['RW'] else ':ro')]
    for env in spec['Config'].get('Env', []):
        if '--auth-callback' in sys.argv and env.startswith('GOTRUE_URI_ALLOW_LIST='):
            env = 'GOTRUE_URI_ALLOW_LIST=http://127.0.0.1:3000/aceitar-convite**'
        args += ['--env', env]
    for label, value in spec['Config'].get('Labels', {}).items():
        args += ['--label', label + '=' + value]
    for host in spec['HostConfig'].get('ExtraHosts') or []:
        args += ['--add-host', host]
    if spec['Config'].get('User'):
        args += ['--user', spec['Config']['User']]
    entry = spec['Config'].get('Entrypoint') or []
    if entry:
        args += ['--entrypoint', entry[0]]
    args += [spec['Config']['Image'], *entry[1:], *(spec['Config'].get('Cmd') or [])]
    docker('stop', name)
    docker('rm', name)  # Exact inspected disposable container; preserve volumes.
    docker(*args)
    docker('start', name)
    check = json.loads(docker('inspect', name))[0]
    assert all(b['HostIp'] == '127.0.0.1' for bs in (check['HostConfig']['PortBindings'] or {}).values() for b in bs)
    print('Loopback verified:', name)
