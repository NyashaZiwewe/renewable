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
    assert request('/api/admin/company-settings')[0] == 401
    settings = {'name': 'Example Energy', 'logo': '/img/uploads/articles/logo.png', 'motto': 'Clean energy.', 'address': 'Tete, Mozambique', 'mapLocation': '-16.1564, 33.5867', 'phone': '+258 84 123 4567', 'whatsapp': '+258 84 123 4567', 'facebook': 'https://facebook.com/example', 'linkedin': '', 'youtube': '#', 'twitter': ''}
    assert request('/api/admin/company-settings', 'PUT', settings, True, False)[0] == 403
    result = request('/api/admin/company-settings', 'PUT', settings, True)
    assert result[0] == 200, result
    assert request('/api/company-settings')[1]['settings'] == settings
    for key, value in [('phone','bad number'), ('whatsapp','https://wa.me/258841234567'), ('logo','logo.png'), ('facebook','javascript:alert(1)'), ('motto','x'*1001)]:
        result = request('/api/admin/company-settings', 'PUT', {**settings, key: value}, True)
        assert result[0] == 400 and result[1]['field'] == key, result
    assert request('/api/company-settings')[1]['settings'] == settings
    without_logo = {key: value for key, value in settings.items() if key != 'logo'}
    without_logo['motto'] = 'Updated motto.'
    for logo_update in ({}, {'logo': None}, {'logo': '/img/uploads/articles/new-logo.png'}, {'logo': ''}):
        expected_logo = logo_update.get('logo')
        if expected_logo is None:
            expected_logo = settings['logo']
        expected = {**without_logo, 'logo': expected_logo}
        assert request('/api/admin/company-settings', 'PUT', {**without_logo, **logo_update}, True) == (200, {'settings': expected})
        assert request('/api/company-settings')[1]['settings'] == expected
    print('Company settings checks passed: complete save including coordinates, persistence, auth/CSRF and field-specific validation errors.')
