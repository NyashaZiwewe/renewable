"""Exercise API dispatch in a temporary copy, using CLI input instead of HTTP transport."""
import tempfile, pathlib, shutil, json, hashlib, os, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='renewable-team-') as directory:
    tmp=pathlib.Path(directory);shutil.copytree(root/'api',tmp/'api');(tmp/'data').mkdir()
    (tmp/'data/users.json').write_text(json.dumps([{'id':'test-admin','email':'admin@example.test','role':'admin'}]))
    (tmp/'data/sessions.json').write_text(json.dumps([{'id':'test-session','userId':'test-admin','tokenHash':hashlib.sha256(b'test-cookie').hexdigest(),'csrfToken':'test-csrf','expiresAt':'2099-01-01T00:00:00Z'}]))
    lib=tmp/'api/lib.php'
    lib.write_text(lib.read_text().replace("$raw=file_get_contents('php://input',false,null,0,MAX_BODY_BYTES+1);", "$raw=getenv('TEST_BODY') ?: '';", 1))
    (tmp/'dispatch.php').write_text("""<?php
$_SERVER['SCRIPT_NAME']='/api/index.php';
$_SERVER['REQUEST_URI']=getenv('TEST_PATH');
$_SERVER['REQUEST_METHOD']=getenv('TEST_METHOD');
$_SERVER['HTTP_X_CSRF_TOKEN']=getenv('TEST_CSRF');
if(getenv('TEST_AUTH')==='yes')$_COOKIE['admin_session']='test-cookie';
parse_str(parse_url(getenv('TEST_PATH'),PHP_URL_QUERY)??'',$_GET);
register_shutdown_function(function(){fwrite(STDERR,'STATUS:'.http_response_code());});
require __DIR__.'/api/index.php';
""")
    env={k:v for k,v in os.environ.items() if not k.startswith(('DB_','MYSQL_'))}
    def request(path,method='GET',data=None,auth=False,csrf=True):
        args={**env,'TEST_PATH':path,'TEST_METHOD':method,'TEST_BODY':json.dumps(data) if data is not None else '', 'TEST_AUTH':'yes' if auth else 'no','TEST_CSRF':'test-csrf' if csrf else ''}
        result=subprocess.run(['php',str(tmp/'dispatch.php')],cwd=tmp,env=args,capture_output=True,text=True)
        assert result.returncode==0,(result.stdout,result.stderr)
        return int(result.stderr.split('STATUS:')[-1]),json.loads(result.stdout)
    assert request('/api/partners')[1] == {'partners': []}
    assert request('/api/admin/partners')[0] == 401
    partner = {'id': 'p1', 'name': 'Partner One', 'logoUrl': '/img/partner.png', 'websiteUrl': 'https://example.com/'}
    payload = {'partners': [partner]}
    assert request('/api/admin/partners', 'PUT', payload, True, False)[0] == 403
    assert request('/api/admin/partners', 'PUT', payload, True)[0] == 200
    assert request('/api/partners')[1] == payload
    assert request('/api/admin/partners', auth=True)[1] == payload
    for bad in [{**partner, 'name': ''}, {**partner, 'logoUrl': 'javascript:alert(1)'}, {**partner, 'websiteUrl': 'javascript:alert(1)'}, {**partner, 'websiteUrl': '//example.com'}, {**partner, 'name': 'x' * 161}]:
        assert request('/api/admin/partners', 'PUT', {'partners': [bad]}, True)[0] == 400
    assert request('/api/admin/partners', 'PUT', {'partners': [partner, partner]}, True)[0] == 400
    second = {**partner, 'id': 'p2', 'name': 'Partner Two'}
    ordered = {'partners': [second, partner]}
    assert request('/api/admin/partners', 'PUT', ordered, True)[0] == 200
    assert request('/api/partners')[1] == ordered
    updated = {'partners': [{**partner, 'websiteUrl': 'https://example.org/'}]}
    assert request('/api/admin/partners', 'PUT', updated, True)[0] == 200
    assert request('/api/partners')[1] == updated
    assert request('/api/admin/partners', 'PUT', {'partners': []}, True)[0] == 200
    assert request('/api/partners')[1] == {'partners': []}
    print('Partner local dispatch checks passed: auth, CSRF, persistence, validation, order, edit and removal.')
