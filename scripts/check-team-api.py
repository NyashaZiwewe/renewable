"""Exercise API dispatch in a temporary copy, using CLI input instead of HTTP transport."""
import tempfile, pathlib, shutil, json, hashlib, os, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='renewable-team-') as directory:
    tmp=pathlib.Path(directory);shutil.copytree(root/'api',tmp/'api');(tmp/'data').mkdir()
    shutil.copytree(root/'locales',tmp/'locales')
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
    assert request('/api/team')[1]=={'intro':'','members':[]}
    assert request('/api/admin/team')[0]==401
    for locale in ('en', 'pt'):
        default_intro=json.loads((tmp/'locales'/locale/'common.json').read_text())['pages']['team']['cultureIntro']
        assert request('/api/admin/team?locale='+locale,auth=True)[1]['intro']==default_intro
    member={'id':'alice','name':'Alice Example','title':'Director','summary':'Experienced renewable energy professional.','imageUrl':'https://example.test/portraits/alice.png?size=300','status':'published'}
    draft={**member,'id':'bob','name':'Bob Example','status':'draft'}
    document={'intro':'Our collaborative team culture.','members':[member,draft]}
    assert request('/api/admin/team','PUT',document,True,False)[0]==403
    result=request('/api/admin/team','PUT',document,True);assert result[0]==200,result
    public=request('/api/team')[1];assert public['intro']==document['intro'] and len(public['members'])==1 and public['members'][0]['name']=='Alice Example'
    assert public['members'][0]['imageUrl']==member['imageUrl']
    admin=request('/api/admin/team',auth=True)[1]
    assert admin['intro']==document['intro'] and len(admin['members'])==2
    assert request('/api/team?locale=pt')[1]['members']==[]
    for bad in [{**member,'title':''},{**member,'imageUrl':'javascript:alert(1)'},{**member,'summary':'x'*5001},{**member,'status':'invalid'}]:
        assert request('/api/admin/team','PUT',{'intro':'','members':[bad]},True)[0]==400
    assert request('/api/admin/team','PUT',{'intro':'','members':[member,member]},True)[0]==400
    assert request('/api/team?locale=xx')[0]==400
    updated={**member,'summary':'Updated professional summary.'}
    assert request('/api/admin/team','PUT',{'intro':'Updated intro','members':[updated]},True)[0]==200
    assert request('/api/team')[1]['members'][0]['summary']==updated['summary']
    assert request('/api/admin/team','PUT',{'intro':'','members':[]},True)[0]==200
    assert request('/api/team')[1]['members']==[]
    print('Team local dispatch checks passed: auth, CSRF, persistence, publish filtering, language separation, validation, edit and removal.')

