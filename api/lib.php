<?php
declare(strict_types=1);

require_once __DIR__ . '/team.php';
require_once __DIR__ . '/partners.php';
require_once __DIR__ . '/faqs.php';
require_once __DIR__ . '/admin-accounts.php';

const API_ROOT = __DIR__ . '/..';
const API_DATA = API_ROOT . '/data';
const SESSION_LIFETIME = 604800;
const RESET_LIFETIME = 1800;
const MAX_BODY_BYTES = 1048576;
const MAX_UPLOAD_BYTES = 5242880;

function load_env(): void {
    $file = API_ROOT . '/.env';
    if (!is_file($file) || !is_readable($file)) return;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key); $value = trim(trim($value), "\"'");
        if ($key !== '' && getenv($key) === false) putenv($key . '=' . $value);
    }
}

function envv(string $name, string $default = ''): string { $v = getenv($name); return $v === false ? $default : $v; }
function db(): ?PDO {
    static $pdo = null; static $ready = false;
    if ($ready) return $pdo;
    $ready = true;
    $host = trim(envv('DB_HOST', envv('MYSQL_HOST'))); $name = envv('DB_NAME', envv('MYSQL_DATABASE')); $user = envv('DB_USER', envv('MYSQL_USER'));
    if ($host === '' && $name === '' && $user === '') return null;
    if ($host === '' || $name === '' || $user === '') throw new RuntimeException('DB_HOST, DB_NAME and DB_USER are required.');
    $port = (int)envv('DB_PORT', envv('MYSQL_PORT', '3306'));
    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, envv('DB_PASSWORD', envv('MYSQL_PASSWORD')), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    ensure_schema($pdo);
    migrate_json($pdo);
    migrate_whistleblowing_json($pdo);
    return $pdo;
}

function ensure_schema(PDO $pdo): void {
    $sql = [
        "CREATE TABLE IF NOT EXISTS admin_users (id CHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL UNIQUE,role VARCHAR(40) NOT NULL DEFAULT 'admin',password_hash VARCHAR(255) NOT NULL,created_at DATETIME(3) NOT NULL,password_changed_at DATETIME(3) NOT NULL,INDEX idx_admin_users_role(role)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS admin_sessions (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,csrf_token VARCHAR(128) NOT NULL,created_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NOT NULL,INDEX idx_admin_sessions_user(user_id),INDEX idx_admin_sessions_expires(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS password_resets (id CHAR(36) PRIMARY KEY,user_id CHAR(36) NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,created_at DATETIME(3) NOT NULL,expires_at DATETIME(3) NOT NULL,used_at DATETIME(3) NULL,INDEX idx_password_resets_user(user_id),INDEX idx_password_resets_expires(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS articles (id CHAR(36) PRIMARY KEY,title VARCHAR(160) NOT NULL,slug VARCHAR(140) NOT NULL,locale VARCHAR(2) NOT NULL,summary TEXT NULL,content LONGTEXT NOT NULL,image_url VARCHAR(500) NULL,status VARCHAR(20) NOT NULL DEFAULT 'draft',author_email VARCHAR(254) NOT NULL,updated_by VARCHAR(254) NOT NULL,created_at DATETIME(3) NOT NULL,updated_at DATETIME(3) NOT NULL,published_at DATETIME(3) NULL,unpublished_at DATETIME(3) NULL,UNIQUE KEY uniq_articles_locale_slug(locale,slug),INDEX idx_articles_status_locale(status,locale),INDEX idx_articles_newest(published_at,updated_at,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS products (id CHAR(36) PRIMARY KEY,locale VARCHAR(2) NOT NULL,name VARCHAR(160) NOT NULL,description TEXT NOT NULL,availability VARCHAR(40) NOT NULL DEFAULT 'available',image_url VARCHAR(500) NULL,price DECIMAL(12,2) NOT NULL DEFAULT 0,old_price DECIMAL(12,2) NULL,currency VARCHAR(12) NOT NULL DEFAULT 'MZN',properties LONGTEXT NULL,status VARCHAR(20) NOT NULL DEFAULT 'draft',author_email VARCHAR(254) NOT NULL,updated_by VARCHAR(254) NOT NULL,created_at DATETIME(3) NOT NULL,updated_at DATETIME(3) NOT NULL,published_at DATETIME(3) NULL,unpublished_at DATETIME(3) NULL,INDEX idx_products_status_locale(status,locale),INDEX idx_products_newest(published_at,updated_at,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS leads (id CHAR(36) PRIMARY KEY,locale VARCHAR(2) NOT NULL,form_name VARCHAR(160) NULL,subject VARCHAR(200) NOT NULL DEFAULT '',status VARCHAR(20) NOT NULL DEFAULT 'new',page_url VARCHAR(500) NULL,name VARCHAR(160) NOT NULL,phone VARCHAR(80) NULL,email VARCHAR(254) NULL,province VARCHAR(160) NULL,district VARCHAR(160) NULL,consent TINYINT(1) NOT NULL DEFAULT 0,payload LONGTEXT NOT NULL,ip_address VARCHAR(64) NULL,user_agent VARCHAR(500) NULL,created_at DATETIME(3) NOT NULL,INDEX idx_leads_created(created_at),INDEX idx_leads_locale(locale),INDEX idx_leads_email(email)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
        "CREATE TABLE IF NOT EXISTS lead_notification_settings (id TINYINT PRIMARY KEY,recipient_email VARCHAR(254) NOT NULL DEFAULT '',updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        ,"CREATE TABLE IF NOT EXISTS whistleblowing_reports (id CHAR(36) PRIMARY KEY,token_hash CHAR(64) NOT NULL UNIQUE,reporter_type VARCHAR(120) NOT NULL,outline TEXT NOT NULL,people TEXT NOT NULL,time_period VARCHAR(500) NOT NULL DEFAULT '',ongoing VARCHAR(40) NOT NULL,proof_links TEXT NOT NULL,information_nature VARCHAR(100) NOT NULL,superiors TEXT NOT NULL,email VARCHAR(254) NULL,status VARCHAR(40) NOT NULL DEFAULT 'new',created_at DATETIME(3) NOT NULL,INDEX idx_whistle_reports_created(created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        ,"CREATE TABLE IF NOT EXISTS whistleblowing_messages (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,report_id CHAR(36) NOT NULL,sender VARCHAR(20) NOT NULL,body TEXT NOT NULL,author_email VARCHAR(254) NULL,created_at DATETIME(3) NOT NULL,INDEX idx_whistle_messages_report_created(report_id,created_at),CONSTRAINT fk_whistle_messages_report FOREIGN KEY(report_id) REFERENCES whistleblowing_reports(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        ,"CREATE TABLE IF NOT EXISTS renewable_php_migrations (migration_key VARCHAR(100) PRIMARY KEY,completed_at DATETIME(3) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    ];
    $sql[] = "CREATE TABLE IF NOT EXISTS partner_content (id TINYINT PRIMARY KEY,payload LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    $sql[] = "CREATE TABLE IF NOT EXISTS faq_content (locale VARCHAR(2) PRIMARY KEY,payload LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    $sql[] = "CREATE TABLE IF NOT EXISTS team_content (locale VARCHAR(2) PRIMARY KEY,payload LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    $sql[] = "CREATE TABLE IF NOT EXISTS company_settings (id TINYINT PRIMARY KEY,payload LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    foreach ($sql as $statement) $pdo->exec($statement);
    foreach (["ALTER TABLE products ADD COLUMN properties LONGTEXT NULL AFTER currency", "ALTER TABLE leads ADD COLUMN subject VARCHAR(200) NOT NULL DEFAULT '' AFTER form_name", "ALTER TABLE leads ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'new' AFTER subject"] as $alter) {
        try { $pdo->exec($alter); } catch (PDOException $e) { if (!str_contains(strtolower($e->getMessage()), 'duplicate column')) throw $e; }
    }
}

function json_path(string $name): string { return API_DATA . '/' . ['users'=>'users.json','sessions'=>'sessions.json','articles'=>'articles.json','products'=>'products.json','resets'=>'password-resets.json','leads'=>'leads.json'][$name]; }
function table_name(string $name): string { return ['users'=>'admin_users','sessions'=>'admin_sessions','articles'=>'articles','products'=>'products','resets'=>'password_resets','leads'=>'leads'][$name]; }
function camelize_row(array $row): array {
    $out=[]; foreach ($row as $key=>$value) { $camel=preg_replace_callback('/_([a-z])/', fn($m)=>strtoupper($m[1]), $key); $out[$camel]=$value; }
    foreach (['createdAt','updatedAt','publishedAt','unpublishedAt','passwordChangedAt','expiresAt','usedAt'] as $key) if (isset($out[$key]) && $out[$key] !== '') $out[$key]=sql_iso((string)$out[$key]);
    if (isset($out['consent'])) $out['consent']=(bool)$out['consent'];
    if (isset($out['payload'])) $out['payload']=json_decode((string)$out['payload'],true) ?: [];
    if (isset($out['properties'])) $out['properties']=normalize_properties(json_decode((string)$out['properties'],true) ?: []);
    if (isset($out['price'])) $out['price']=(float)$out['price'];
    if (array_key_exists('oldPrice',$out)) $out['oldPrice']=$out['oldPrice'] === null ? null : (float)$out['oldPrice'];
    return $out;
}
function sql_iso(string $value): string { try { return (new DateTimeImmutable($value, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z'); } catch(Throwable) { return $value; } }
function read_store(string $name): array {
    $pdo=db(); if ($pdo) { $stmt=$pdo->query('SELECT * FROM `'.table_name($name).'` ORDER BY created_at ASC'); return array_map('camelize_row',$stmt->fetchAll()); }
    $file=json_path($name); if (!is_file($file)) return [];
    $data=json_decode((string)file_get_contents($file),true); return is_array($data)?$data:[];
}
function db_insert(PDO $pdo,string $name,array $r): void {
    $sets = [
      'users'=>['admin_users',['id','email','role','password_hash','created_at','password_changed_at'],[$r['id'],$r['email'],$r['role']??'admin',$r['passwordHash'],sql_date($r['createdAt']),sql_date($r['passwordChangedAt']??$r['createdAt'])]],
      'sessions'=>['admin_sessions',['id','user_id','token_hash','csrf_token','created_at','expires_at'],[$r['id'],$r['userId'],$r['tokenHash'],$r['csrfToken'],sql_date($r['createdAt']),sql_date($r['expiresAt'])]],
      'resets'=>['password_resets',['id','user_id','token_hash','created_at','expires_at','used_at'],[$r['id'],$r['userId'],$r['tokenHash'],sql_date($r['createdAt']),sql_date($r['expiresAt']),sql_date($r['usedAt']??null)]],
      'articles'=>['articles',['id','title','slug','locale','summary','content','image_url','status','author_email','updated_by','created_at','updated_at','published_at','unpublished_at'],[$r['id'],$r['title'],$r['slug'],$r['locale'],$r['summary']?:null,$r['content']??'',$r['imageUrl']?:null,$r['status']??'draft',$r['authorEmail']??'',$r['updatedBy']??$r['authorEmail']??'',sql_date($r['createdAt']),sql_date($r['updatedAt']??$r['createdAt']),sql_date($r['publishedAt']??null),sql_date($r['unpublishedAt']??null)]],
      'products'=>['products',['id','locale','name','description','availability','image_url','price','old_price','currency','properties','status','author_email','updated_by','created_at','updated_at','published_at','unpublished_at'],[$r['id'],$r['locale'],$r['name'],$r['description']??'',$r['availability']??'available',$r['imageUrl']?:null,$r['price']??0,$r['oldPrice']??null,$r['currency']??'MZN',json_encode(normalize_properties($r['properties']??[])),$r['status']??'draft',$r['authorEmail']??'',$r['updatedBy']??$r['authorEmail']??'',sql_date($r['createdAt']),sql_date($r['updatedAt']??$r['createdAt']),sql_date($r['publishedAt']??null),sql_date($r['unpublishedAt']??null)]],
      'leads'=>['leads',['id','locale','form_name','subject','status','page_url','name','phone','email','province','district','consent','payload','ip_address','user_agent','created_at'],[$r['id'],$r['locale'],$r['formName']?:null,$r['subject']??$r['formName']??'Website query',$r['status']??'new',$r['pageUrl']?:null,$r['name'],$r['phone']?:null,$r['email']?:null,$r['province']?:null,$r['district']?:null,!empty($r['consent'])?1:0,json_encode($r['payload']??[]),$r['ipAddress']?:null,$r['userAgent']?:null,sql_date($r['createdAt'])]]
    ];
    [$table,$columns,$values]=$sets[$name]; $marks=implode(',',array_fill(0,count($columns),'?')); $cols=implode(',',array_map(fn($c)=>"`$c`",$columns));
    $stmt=$pdo->prepare("INSERT INTO `$table` ($cols) VALUES ($marks)"); $stmt->execute($values);
}
function sql_date(?string $value): ?string { if (!$value) return null; try{return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');}catch(Throwable){return null;} }
function write_store(string $name,array $records): void {
    $pdo=db(); if ($pdo) { $pdo->beginTransaction(); try { $pdo->exec('DELETE FROM `'.table_name($name).'`'); foreach($records as $record) db_insert($pdo,$name,$record); $pdo->commit(); } catch(Throwable $e){$pdo->rollBack();throw $e;} return; }
    if (!is_dir(API_DATA) && !mkdir(API_DATA,0700,true) && !is_dir(API_DATA)) throw new RuntimeException('Data directory is unavailable.');
    $file=json_path($name);
    if (in_array($name, ['users','sessions','resets'], true)) {
        $json=json_encode($records, JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)."\n";
        $temporary=tempnam(API_DATA, 'admin-');
        if ($temporary===false) throw new RuntimeException('Data file is unavailable.');
        try {
            if (file_put_contents($temporary,$json)!==strlen($json) || !rename($temporary,$file)) {
                throw new RuntimeException('Unable to save admin data.');
            }
        } finally {
            if (is_file($temporary)) unlink($temporary);
        }
        return;
    }
    $fp=fopen($file,'c+'); if (!$fp) throw new RuntimeException('Data file is unavailable.');
    try { flock($fp,LOCK_EX); ftruncate($fp,0); rewind($fp); fwrite($fp,json_encode($records,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)."\n"); fflush($fp); flock($fp,LOCK_UN); } finally { fclose($fp); }
}
function migrate_json(PDO $pdo): void { $pdo->query("SELECT GET_LOCK('renewable_php_json_import',10)")->fetchColumn();try{$check=$pdo->prepare('SELECT migration_key FROM renewable_php_migrations WHERE migration_key=?');$check->execute(['json-store-import-v1']);if($check->fetchColumn())return;$pdo->beginTransaction();try{foreach(['users','sessions','articles','products','resets','leads'] as $name){$file=json_path($name);if(!is_file($file))continue;$records=json_decode((string)file_get_contents($file),true);if(!is_array($records)||!$records)continue;$table=table_name($name);$count=(int)$pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();if($count===0)foreach($records as $r)db_insert($pdo,$name,$r);}$stmt=$pdo->prepare('INSERT INTO renewable_php_migrations(migration_key,completed_at) VALUES(?,UTC_TIMESTAMP(3))');$stmt->execute(['json-store-import-v1']);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}}finally{$pdo->query("SELECT RELEASE_LOCK('renewable_php_json_import')");} }
function clean(string $value,int $length): string { return mb_substr(trim($value),0,$length,'UTF-8'); }
function email_norm(string $value): string { return strtolower(trim($value)); }
function locale_norm(mixed $v): string { return in_array($v,['en','pt'],true)?$v:''; }
function uuid(): string { $b=random_bytes(16);$b[6]=chr((ord($b[6])&0x0f)|0x40);$b[8]=chr((ord($b[8])&0x3f)|0x80);return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($b),4)); }
function token(int $bytes=32): string { return rtrim(strtr(base64_encode(random_bytes($bytes)),'+/','-_'),'='); }
function token_hash(string $value): string { return hash('sha256',$value); }
function now_iso(): string { return gmdate('Y-m-d\TH:i:s.v\Z'); }
function json_response(int $status,array $data,array $headers=[]): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: strict-origin-when-cross-origin');foreach($headers as $k=>$v)header($k.': '.$v);echo json_encode($data,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);exit; }
function body_json(): array { $raw=file_get_contents('php://input',false,null,0,MAX_BODY_BYTES+1);if(strlen($raw)>MAX_BODY_BYTES)json_response(413,['error'=>'body_too_large','message'=>'Request body too large.']);if(trim($raw)==='')return []; $data=json_decode($raw,true);if(!is_array($data))json_response(400,['error'=>'invalid_json','message'=>'Invalid JSON.']);return $data; }
function request_path(): string { $uri=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/';$base=dirname(dirname($_SERVER['SCRIPT_NAME']??'/api/index.php'));$base=rtrim($base,'/.');if($base!==''&&str_starts_with($uri,$base.'/'))$uri=substr($uri,strlen($base));return '/'.ltrim($uri,'/'); }
function secure_request(): bool { return (!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||($_SERVER['HTTP_X_FORWARDED_PROTO']??'')==='https'; }
function set_session_cookie(string $value,int $maxAge): void { $base=dirname(dirname($_SERVER['SCRIPT_NAME']??'/api/index.php'));$base=rtrim($base,'/.')?:'/';setcookie('admin_session',$value,['expires'=>time()+$maxAge,'path'=>$base,'secure'=>secure_request(),'httponly'=>true,'samesite'=>'Lax']); }
function request_ip(): string { return clean(explode(',',$_SERVER['HTTP_X_FORWARDED_FOR']??$_SERVER['REMOTE_ADDR']??'unknown')[0],64); }
function rate_allowed(string $bucket,int $limit,int $seconds): bool { $dir=sys_get_temp_dir().'/renewable-rate';if(!is_dir($dir))@mkdir($dir,0700,true);$file=$dir.'/'.hash('sha256',$bucket).'.json';$fp=fopen($file,'c+');if(!$fp)return true;flock($fp,LOCK_EX);$raw=stream_get_contents($fp);$times=json_decode($raw?:'[]',true)?:[];$times=array_values(array_filter($times,fn($t)=>time()-(int)$t<$seconds));$ok=count($times)<$limit;if($ok)$times[]=time();ftruncate($fp,0);rewind($fp);fwrite($fp,json_encode($times));flock($fp,LOCK_UN);fclose($fp);return $ok; }
function password_error(string $value): string { if(strlen($value)>72||str_contains($value,"\0"))return 'Password must be at most 72 bytes and contain no null characters.'; if(strlen($value)<12)return 'Password must be at least 12 characters.';if(!preg_match('/[a-z]/',$value)||!preg_match('/[A-Z]/',$value)||!preg_match('/[0-9]/',$value))return 'Password must include uppercase, lowercase and a number.';return ''; }
function verify_password(string $password,string $hash): bool { if(str_starts_with($hash,'scrypt$'))return false;return password_verify($password,$hash); }
function require_admin(): array { $cookie=$_COOKIE['admin_session']??'';if($cookie==='')json_response(401,['error'=>'not_authenticated','message'=>'Sign in required.']);$sessions=read_store('sessions');$at=null;$session=null;foreach($sessions as $i=>$s){if(hash_equals((string)$s['tokenHash'],token_hash($cookie))&&strtotime((string)$s['expiresAt'])>time()){$session=$s;$at=$i;break;}}if(!$session)json_response(401,['error'=>'not_authenticated','message'=>'Session expired. Sign in again.']);$user=null;foreach(read_store('users') as $u)if($u['id']===$session['userId']&&($u['role']??'admin')==='admin'){$user=$u;break;}if(!$user)json_response(401,['error'=>'not_authenticated','message'=>'Session expired. Sign in again.']);return ['session'=>$session,'user'=>$user]; }
function csrf_check(array $session): void { $given=$_SERVER['HTTP_X_CSRF_TOKEN']??'';if($given===''||!hash_equals((string)$session['csrfToken'],$given))json_response(403,['error'=>'csrf_failed','message'=>'Security check failed. Refresh and try again.']); }
function safe_image(string $url): bool { return preg_match('~^https?://~i',$url)===1||str_starts_with($url,'/img/')||str_starts_with($url,'../img/')||preg_match('~^/[^/]+/img/~',$url)===1; }
function normalize_properties(mixed $items): array { if(!is_array($items))return []; $out=[];foreach($items as $p){if(!is_array($p))continue;$key=clean((string)($p['key']??''),80);$value=clean((string)($p['value']??''),200);if($key!==''||$value!=='')$out[]=['key'=>$key,'value'=>$value];}return $out; }
function slugify(string $value): string {
    if (function_exists('iconv')) {
        $value = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
    }
    return substr(trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($value)), '-'), 0, 120);
}
function sanitize_article(string $html): string {
    $allowed=['p','br','strong','b','em','i','u','s','a','ul','ol','li','blockquote','h2','h3','h4','figure','figcaption','img','table','thead','tbody','tfoot','tr','th','td','hr','span'];
    if(!class_exists(DOMDocument::class)) return strip_tags($html);
    $doc=new DOMDocument('1.0','UTF-8');$old=libxml_use_internal_errors(true);$doc->loadHTML('<?xml encoding="UTF-8"><div id="sanitize-root">'.$html.'</div>',LIBXML_HTML_NOIMPLIED|LIBXML_HTML_NODEFDTD);libxml_clear_errors();libxml_use_internal_errors($old);$root=$doc->getElementsByTagName('div')->item(0);if(!$root)return '';
    $walk=function(DOMNode $node)use(&$walk,$allowed):void{for($child=$node->firstChild;$child;){$next=$child->nextSibling;if($child instanceof DOMElement){$tag=strtolower($child->tagName);if(!in_array($tag,$allowed,true)){if(in_array($tag,['script','style','iframe','object','embed','svg','math'],true))$node->removeChild($child);else{while($child->firstChild)$node->insertBefore($child->firstChild,$child);$node->removeChild($child);} }else{$attrs=['a'=>['href','target','rel'],'img'=>['src','alt','title','width','height'],'figure'=>['class'],'figcaption'=>['class'],'table'=>['class'],'th'=>['colspan','rowspan'],'td'=>['colspan','rowspan'],'span'=>['class']][$tag]??[];foreach(iterator_to_array($child->attributes) as $attr)if(!in_array(strtolower($attr->name),$attrs,true))$child->removeAttribute($attr->name);if($tag==='a'){$href=$child->getAttribute('href');if($href!==''&&!preg_match('~^(https?://|mailto:|/)~i',$href))$child->removeAttribute('href');$child->setAttribute('rel','noopener noreferrer');}if($tag==='img'&&!safe_image($child->getAttribute('src')))$node->removeChild($child);else$walk($child);}}$child=$next;}};$walk($root);$out='';foreach($root->childNodes as $child)$out.=$doc->saveHTML($child);return trim($out);
}
function article_plain(string $html): string { return trim(preg_replace('/\s+/u',' ',html_entity_decode(strip_tags($html)))??''); }
function public_article(array $a,bool $include=true): array { $o=['id'=>$a['id'],'title'=>$a['title'],'slug'=>$a['slug'],'locale'=>$a['locale'],'summary'=>$a['summary']??'','imageUrl'=>safe_image((string)($a['imageUrl']??''))?$a['imageUrl']:'','publishedAt'=>$a['publishedAt']??null,'updatedAt'=>$a['updatedAt']??null];if($include)$o['content']=sanitize_article((string)$a['content']);return $o; }
function public_product(array $p): array { return ['id'=>$p['id'],'locale'=>$p['locale'],'name'=>$p['name'],'description'=>$p['description'],'availability'=>$p['availability'],'properties'=>normalize_properties($p['properties']??[]),'imageUrl'=>safe_image((string)($p['imageUrl']??''))?$p['imageUrl']:'','price'=>(float)$p['price'],'oldPrice'=>isset($p['oldPrice'])?(float)$p['oldPrice']:null,'currency'=>$p['currency']?:'MZN','publishedAt'=>$p['publishedAt']??null,'updatedAt'=>$p['updatedAt']??null]; }
function sorted_newest(array $items): array { usort($items,fn($a,$b)=>strtotime((string)($b['publishedAt']??$b['updatedAt']??$b['createdAt']??''))<=>strtotime((string)($a['publishedAt']??$a['updatedAt']??$a['createdAt']??'')));return $items; }
function db_setting_get(): string { $pdo=db();if($pdo){$q=$pdo->query('SELECT recipient_email FROM lead_notification_settings WHERE id=1');return email_norm((string)($q->fetchColumn()?:envv('LEAD_NOTIFICATION_EMAIL')));} $s=@json_decode((string)@file_get_contents(API_DATA.'/lead-settings.json'),true)?:[];return email_norm((string)($s['notificationEmail']??envv('LEAD_NOTIFICATION_EMAIL'))); }
function db_setting_set(string $email): void { $pdo=db();if($pdo){$q=$pdo->prepare('INSERT INTO lead_notification_settings(id,recipient_email,updated_at) VALUES(1,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE recipient_email=VALUES(recipient_email),updated_at=VALUES(updated_at)');$q->execute([$email]);return;}file_put_contents(API_DATA.'/lead-settings.json',json_encode(['notificationEmail'=>$email,'updatedAt'=>now_iso()],JSON_PRETTY_PRINT),LOCK_EX); }
function send_email(string $to,string $subject,string $text,string $fromEnv='LEAD_EMAIL_FROM'): bool {
    $key=envv('RESEND_API_KEY');
    $from=envv($fromEnv,envv($fromEnv==='RESET_EMAIL_FROM'?'LEAD_EMAIL_FROM':'RESET_EMAIL_FROM'));
    if(!$key||!$from){error_log('Email notification skipped: RESEND_API_KEY or sender address is not configured.');return false;}
    if(!function_exists('curl_init')){error_log('Email notification skipped: PHP cURL is unavailable.');return false;}
    $ch=curl_init('https://api.resend.com/emails');
    curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key,'Content-Type: application/json'],CURLOPT_POSTFIELDS=>json_encode(['from'=>$from,'to'=>$to,'subject'=>$subject,'text'=>$text]),CURLOPT_TIMEOUT=>15]);
    $response=curl_exec($ch);$status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$curlError=curl_error($ch);curl_close($ch);
    if($response===false){error_log('Email notification failed: cURL transport error: '.$curlError);return false;}
    if($status<200||$status>=300){error_log('Email notification failed: provider returned HTTP '.$status);return false;}
    return true;
}
function notify_lead(array $l): void { $to=db_setting_get();if(!$to)return;$lines=['A new query was submitted on the website.','','Name: '.$l['name'],'Subject: '.$l['subject'],'Email: '.($l['email']?:'Not provided'),'Phone: '.($l['phone']?:'Not provided'),'Form: '.($l['formName']?:'Not specified'),'Language: '.$l['locale'],'Page: '.($l['pageUrl']?:'Not provided'),'Submitted: '.$l['createdAt'],'','Submitted fields:'];foreach($l['payload'] as $k=>$v){if(in_array($k,['company','consent','subject'],true))continue;$lines[]=ucwords(str_replace(['_','-'], ' ',preg_replace('/([A-Z])/',' $1',$k))).': '.(is_scalar($v)?(string)$v:json_encode($v));}send_email($to,'New website query: '.$l['subject'],implode("\n",$lines)); }
function company_settings(): array {
    $pdo=db();
    $raw=$pdo ? $pdo->query('SELECT payload FROM company_settings WHERE id=1')->fetchColumn() : @file_get_contents(API_DATA.'/company-settings.json');
    return array_merge(array_fill_keys(['name','logo','motto','address','mapLocation','phone','whatsapp','facebook','linkedin','youtube','twitter'], ''), json_decode((string)$raw,true) ?: []);
}
function save_company_settings(): never {
    $body=body_json();$values=[];
    foreach(company_settings() as $key=>$storedValue){
        if($key==='logo'&&!isset($body[$key])){
            $values[$key]=$storedValue;
            continue;
        }
        if(isset($body[$key])&&!is_string($body[$key]))json_response(400,['field'=>$key,'message'=>'Enter a text value for '.$key.'.']);
        $value=trim((string)($body[$key]??''));
        if(strlen($value)>1000)json_response(400,['field'=>$key,'message'=>'The '.$key.' field must be 1000 characters or fewer.']);
        if(in_array($key,['facebook','linkedin','youtube','twitter','logo'],true)&&$value!==''&&$value!=='#'){
            $localLogo=$key==='logo'&&preg_match('~^/(?!/)[a-zA-Z0-9/_.-]+$~',$value);
            if(!$localLogo&&(!filter_var($value,FILTER_VALIDATE_URL)||!in_array(strtolower(parse_url($value,PHP_URL_SCHEME)??''),['http','https'],true)))json_response(400,['field'=>$key,'message'=>'Enter a full http or https URL for '.$key.'.']);
        }
        if(in_array($key,['phone','whatsapp'],true)&&$value!==''&&!preg_match('/^\+?[0-9 ()-]{5,40}$/',$value))json_response(400,['field'=>$key,'message'=>($key==='whatsapp'?'WhatsApp number':'Call number').': enter one phone number including country code, for example +258 84 123 4567. Use digits, spaces, parentheses or hyphens.']);
        $values[$key]=$value;
    }
    $json=json_encode($values,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);$pdo=db();
    if($pdo){$q=$pdo->prepare('INSERT INTO company_settings(id,payload) VALUES(1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)');$q->execute([$json]);}
    elseif(file_put_contents(API_DATA.'/company-settings.json',$json,LOCK_EX)===false)throw new RuntimeException('Could not save company settings.');
    json_response(200,['settings'=>$values]);
}
function api_dispatch(): never {
    load_env(); $path=request_path();$method=$_SERVER['REQUEST_METHOD']??'GET';$query=$_GET;
    try {
        if($method==='GET'&&$path==='/api/team'){
            $content=team_content(team_locale());
            $content['members']=array_values(array_filter($content['members'],fn($member)=>$member['status']==='published'));
            json_response(200,$content);
        }
        if($method==='GET'&&$path==='/api/faqs')faq_request($method);
        if($method==='GET'&&$path==='/api/partners')json_response(200,partner_content());
        if($method==='GET'&&$path==='/api/company-settings')json_response(200,['settings'=>company_settings()]);
        if($method==='GET'&&$path==='/api/products'){$locale=locale_norm((string)($query['locale']??''));$rows=array_values(array_filter(read_store('products'),fn($p)=>$p['status']==='published'&&(!$locale||$p['locale']===$locale)));json_response(200,['products'=>array_map('public_product',sorted_newest($rows))]);}
        if($method==='GET'&&$path==='/api/articles'){$locale=locale_norm((string)($query['locale']??''));$rows=array_values(array_filter(read_store('articles'),fn($a)=>$a['status']==='published'&&(!$locale||$a['locale']===$locale)));json_response(200,['articles'=>array_map(fn($a)=>public_article($a,false),sorted_newest($rows))]);}
        if($method==='GET'&&preg_match('~^/api/articles/(.+)$~',$path,$m)){$slug=rawurldecode($m[1]);foreach(read_store('articles') as $a)if($a['status']==='published'&&$a['slug']===$slug&&(!locale_norm((string)($query['locale']??''))||$a['locale']===locale_norm((string)$query['locale'])))json_response(200,['article'=>public_article($a)]);json_response(404,['error'=>'not_found','message'=>'Article not found.']);}
        if($method==='POST'&&$path==='/api/leads'){create_lead();}
        if($method==='POST'&&$path==='/api/whistleblowing'){create_whistle_report();}
        if($method==='GET'&&$path==='/api/whistleblowing/conversation')public_whistle_conversation((string)($query['token']??''));
        if($method==='POST'&&$path==='/api/whistleblowing/conversation')public_whistle_message();
        if($method==='POST'&&in_array($path,[
            '/api/admin/login','/api/admin/logout','/api/admin/reset-password','/api/admin/change-password',
        ],true)) $accountLock=lock_admin_accounts();
        if($method==='POST'&&$path==='/api/admin/login'){login_admin();}
        if($method==='POST'&&$path==='/api/admin/logout'){logout_admin();}
        if($method==='POST'&&$path==='/api/admin/request-password-reset'){request_reset();}
        if($method==='POST'&&$path==='/api/admin/reset-password'){reset_password();}
        if(!str_starts_with($path,'/api/admin/'))json_response(404,['error'=>'not_found','message'=>'Endpoint not found.']);
        $auth=require_admin();$session=$auth['session'];$user=$auth['user'];
        if($method==='GET'&&$path==='/api/admin/me')json_response(200,['user'=>['email'=>$user['email']],'csrfToken'=>$session['csrfToken'],'logo'=>company_settings()['logo']]);
        if($method==='GET'&&$path==='/api/admin/articles')json_response(200,['articles'=>sorted_newest(read_store('articles'))]);
        if($method==='GET'&&$path==='/api/admin/products')json_response(200,['products'=>sorted_newest(read_store('products'))]);
        if($method==='GET'&&$path==='/api/admin/whistleblowing')json_response(200,['reports'=>array_map('public_whistle_report',sorted_newest(whistle_reports()))]);
        if($method==='GET'&&$path==='/api/admin/leads'){$leads=array_map(function($l){$l['subject']=clean((string)($l['subject']??$l['formName']??'Website query'),200);$l['status']=lead_status($l['status']??'new');return $l;},sorted_newest(read_store('leads')));json_response(200,['leads'=>$leads]);}
        if($method==='GET'&&$path==='/api/admin/lead-settings')json_response(200,['notificationEmail'=>db_setting_get()]);
        if($method==='GET'&&$path==='/api/admin/company-settings')json_response(200,['settings'=>company_settings()]);
        if($method==='GET'&&$path==='/api/admin/team'){
            $locale=team_locale();
            json_response(200,team_editor_content($locale,team_content($locale)));
        }
        if($method==='GET'&&$path==='/api/admin/partners')json_response(200,partner_content());
        if(in_array($method,['POST','PUT','DELETE'],true))csrf_check($session);
        if(in_array($method,['GET','POST'],true)&&$path==='/api/admin/faqs')faq_request($method);
        if(in_array($method,['PUT','DELETE'],true)&&preg_match('~^/api/admin/faqs/([a-zA-Z0-9-]+)$~',$path,$m))faq_request($method,$m[1]);
        if($method==='PUT'&&$path==='/api/admin/partners')save_partner_content();
        if($method==='PUT'&&$path==='/api/admin/team')save_team_content(team_locale());
        if($method==='PUT'&&$path==='/api/admin/company-settings')save_company_settings();
        if($method==='POST'&&preg_match('~^/api/admin/whistleblowing/([^/]+)/messages$~',$path,$m))admin_whistle_message(rawurldecode($m[1]),$user);
        if($method==='PUT'&&preg_match('~^/api/admin/whistleblowing/([^/]+)/status$~',$path,$m))admin_whistle_status(rawurldecode($m[1]));
        if($method==='PUT'&&$path==='/api/admin/lead-settings'){$b=body_json();$email=email_norm((string)($b['notificationEmail']??''));if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))json_response(400,['error'=>'invalid_email','message'=>'Enter a valid notification email address.']);db_setting_set($email);json_response(200,['ok'=>true,'notificationEmail'=>$email]);}
        if($method==='PUT'&&preg_match('~^/api/admin/leads/([^/]+)$~',$path,$m)){$id=rawurldecode($m[1]);$b=body_json();$status=$b['status']??'';if(!in_array($status,['new','in_progress','resolved'],true))json_response(400,['error'=>'invalid_lead_status','message'=>'Choose a valid query status.']);$rows=read_store('leads');foreach($rows as &$l)if($l['id']===$id){$l['subject']=clean((string)($l['subject']??$l['formName']??'Website query'),200);$l['status']=$status;write_store('leads',$rows);json_response(200,['ok'=>true,'lead'=>$l]);}json_response(404,['error'=>'not_found','message'=>'Query not found.']);}
        if($method==='POST'&&$path==='/api/admin/uploads')upload_image();
        if($method==='POST'&&$path==='/api/admin/articles')save_article(null,$user);
        if($method==='POST'&&$path==='/api/admin/products')save_product(null,$user);
        if(preg_match('~^/api/admin/articles/([^/]+)$~',$path,$m)){if($method==='PUT')save_article(rawurldecode($m[1]),$user);if($method==='DELETE')delete_record('articles',rawurldecode($m[1]));}
        if(preg_match('~^/api/admin/products/([^/]+)$~',$path,$m)){if($method==='PUT')save_product(rawurldecode($m[1]),$user);if($method==='DELETE')delete_record('products',rawurldecode($m[1]));}
        if($method==='POST'&&$path==='/api/admin/accounts'){
            $accountLock=lock_admin_accounts();
            require_admin();
            create_admin_account();
        }
        if($method==='POST'&&$path==='/api/admin/change-password')change_password($auth);
        json_response(404,['error'=>'not_found','message'=>'Endpoint not found.']);
    } catch(Throwable $e) { error_log('Renewable API: '.$e->getMessage());json_response(500,['error'=>'server_error','message'=>'Something went wrong.']); }
}

function login_admin(): never { $b=body_json();$email=email_norm((string)($b['email']??''));if(!rate_allowed('login:'.request_ip().':'.$email,8,900))json_response(429,['error'=>'rate_limited','message'=>'Too many attempts. Try again later.']);foreach(read_store('users') as $u)if($u['email']===$email&&($u['role']??'admin')==='admin'&&verify_password((string)($b['password']??''),(string)$u['passwordHash'])){$t=token();$csrf=token(24);$now=now_iso();$sessions=read_store('sessions');$sessions[]= ['id'=>uuid(),'userId'=>$u['id'],'tokenHash'=>token_hash($t),'csrfToken'=>$csrf,'createdAt'=>$now,'expiresAt'=>gmdate('Y-m-d\TH:i:s.v\Z',time()+SESSION_LIFETIME)];write_store('sessions',array_values(array_filter($sessions,fn($s)=>strtotime($s['expiresAt'])>time())));set_session_cookie($t,SESSION_LIFETIME);json_response(200,['user'=>['email'=>$u['email']],'csrfToken'=>$csrf]);}json_response(401,['error'=>'invalid_credentials','message'=>'Email or password is incorrect.']); }
function logout_admin(): never { $token=$_COOKIE['admin_session']??'';if($token){$hash=token_hash($token);write_store('sessions',array_values(array_filter(read_store('sessions'),fn($s)=>!hash_equals((string)$s['tokenHash'],$hash))));}set_session_cookie('',-3600);json_response(200,['ok'=>true]); }
function whistle_db(): PDO {
    $pdo = db();
    if (!$pdo) throw new RuntimeException('Database configuration is required for whistleblowing reports.');
    return $pdo;
}
function insert_whistle_report(PDO $pdo, array $r): void {
    $stmt = $pdo->prepare('INSERT INTO whistleblowing_reports (id,token_hash,reporter_type,outline,people,time_period,ongoing,proof_links,information_nature,superiors,email,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $stmt->execute([$r['id'],$r['tokenHash'],$r['reporterType'],$r['outline'],$r['people'],$r['timePeriod']??'',$r['ongoing'],$r['proofLinks']??'',$r['informationNature'],$r['superiors']??'',$r['email']?:null,$r['status']??'new',sql_date($r['createdAt'])]);
}
function insert_whistle_message(PDO $pdo, string $reportId, string $from, string $body, ?string $author, string $createdAt): void {
    $stmt=$pdo->prepare('INSERT INTO whistleblowing_messages (report_id,sender,body,author_email,created_at) VALUES (?,?,?,?,?)');
    $stmt->execute([$reportId,$from,$body,$author,sql_date($createdAt)]);
}
function whistle_report_by_token(string $secret): ?array {
    if ($secret==='') return null;
    $stmt=whistle_db()->prepare('SELECT * FROM whistleblowing_reports WHERE token_hash=? LIMIT 1');
    $stmt->execute([token_hash($secret)]);
    return $stmt->fetch() ?: null;
}
function whistle_messages(string $reportId): array {
    $stmt=whistle_db()->prepare('SELECT sender,body,author_email,created_at FROM whistleblowing_messages WHERE report_id=? ORDER BY id ASC');
    $stmt->execute([$reportId]);
    return array_map(fn($m)=>['from'=>$m['sender'],'body'=>$m['body'],'createdAt'=>sql_iso((string)$m['created_at'])],$stmt->fetchAll());
}
function whistle_reports(): array {
    $pdo=whistle_db();
    $reports=$pdo->query('SELECT * FROM whistleblowing_reports ORDER BY created_at DESC')->fetchAll();
    return array_map(function($r)use($pdo){return ['id'=>$r['id'],'tokenHash'=>$r['token_hash'],'reporterType'=>$r['reporter_type'],'outline'=>$r['outline'],'people'=>$r['people'],'timePeriod'=>$r['time_period'],'ongoing'=>$r['ongoing'],'proofLinks'=>$r['proof_links'],'informationNature'=>$r['information_nature'],'superiors'=>$r['superiors'],'email'=>$r['email'],'status'=>$r['status'],'createdAt'=>sql_iso((string)$r['created_at']),'messages'=>whistle_messages((string)$r['id'])];},$reports);
}
function public_whistle_report(array $r): array { unset($r['tokenHash'],$r['email'],$r['ipAddress'],$r['userAgent']);return $r; }
function migrate_whistleblowing_json(PDO $pdo): void {
    $check=$pdo->prepare('SELECT migration_key FROM renewable_php_migrations WHERE migration_key=?');
    $check->execute(['whistleblowing-json-to-db-v1']);
    if($check->fetchColumn())return;
    $file=API_DATA.'/whistleblowing.json';
    $records=is_file($file)?(json_decode((string)file_get_contents($file),true)?:[]):[];
    $pdo->beginTransaction();
    try {
        if($records && (int)$pdo->query('SELECT COUNT(*) FROM whistleblowing_reports')->fetchColumn()===0){
            foreach($records as $r){
                if(!is_array($r)||empty($r['id'])||empty($r['tokenHash']))continue;
                insert_whistle_report($pdo,$r);
                foreach(($r['messages']??[]) as $m)if(is_array($m))insert_whistle_message($pdo,(string)$r['id'],(string)($m['from']??'reporter'),(string)($m['body']??''),isset($m['author'])?(string)$m['author']:null,(string)($m['createdAt']??$r['createdAt']??now_iso()));
            }
        }
        $stmt=$pdo->prepare('INSERT INTO renewable_php_migrations(migration_key,completed_at) VALUES(?,UTC_TIMESTAMP(3))');
        $stmt->execute(['whistleblowing-json-to-db-v1']);
        $pdo->commit();
    }catch(Throwable $e){$pdo->rollBack();throw $e;}
}
function create_whistle_report(): never {
    $b=body_json();
    if(!rate_allowed('whistle:'.request_ip(),5,3600))json_response(429,['error'=>'rate_limited','message'=>'Too many submissions. Try later.']);
    if(clean((string)($b['company']??''),200)!=='')json_response(201,['ok'=>true]);
    $email=email_norm((string)($b['email']??''));
    if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))json_response(400,['error'=>'invalid_email','message'=>'Enter a valid email.']);
    foreach(['reporterType','outline','people','ongoing','informationNature'] as $k)if(trim((string)($b[$k]??''))==='')json_response(400,['error'=>'required','message'=>'Complete all required fields.']);
    foreach(['policyAware','truthful','acknowledged'] as $k)if(empty($b[$k]))json_response(400,['error'=>'declaration_required','message'=>'Confirm all declarations.']);
    $secret=token(24);$now=now_iso();
    $r=['id'=>uuid(),'tokenHash'=>token_hash($secret),'reporterType'=>clean((string)$b['reporterType'],120),'outline'=>clean((string)$b['outline'],5000),'people'=>clean((string)$b['people'],2000),'timePeriod'=>clean((string)($b['timePeriod']??''),500),'ongoing'=>clean((string)$b['ongoing'],40),'proofLinks'=>clean((string)($b['proofLinks']??''),3000),'informationNature'=>clean((string)$b['informationNature'],100),'superiors'=>clean((string)($b['superiors']??''),2000),'email'=>$email,'status'=>'new','createdAt'=>$now];
    $pdo=whistle_db();$pdo->beginTransaction();
    try{insert_whistle_report($pdo,$r);insert_whistle_message($pdo,$r['id'],'reporter','Report submitted.',null,$now);$pdo->commit();}
    catch(Throwable $e){$pdo->rollBack();throw $e;}
    $to=envv('WHISTLEBLOWING_EMAIL',db_setting_get());
    if($to){try{send_email($to,'New whistleblowing report','A confidential report was submitted. Sign in to the admin panel to review it.');}catch(Throwable $e){error_log('Whistleblowing notification failed: '.$e->getMessage());}}else{error_log('Whistleblowing notification skipped: no recipient configured.');}
    $emailSent=false;
    if($email){
        $portuguese=($b['locale']??'en')==='pt';
        $subject=$portuguese?'Código de acompanhamento da sua denúncia':'Your whistleblowing token';
        $text=$portuguese?"Guarde este código num local seguro para acompanhar a sua denúncia: {$secret}":"Keep this token safe for follow-up: {$secret}";
        try{$emailSent=send_email($email,$subject,$text,'LEAD_EMAIL_FROM');}
        catch(Throwable $e){error_log('Whistleblowing token email failed: '.$e->getMessage());}
    }
    json_response(201,['ok'=>true,'token'=>$secret,'emailSent'=>$emailSent]);
}
function public_whistle_conversation(string $secret): never {
    $report=whistle_report_by_token($secret);if(!$report)json_response(404,['error'=>'not_found','message'=>'Token not recognized.']);json_response(200,['messages'=>whistle_messages((string)$report['id']),'status'=>$report['status']]);
}
function public_whistle_message(): never {
    $b=body_json();$report=whistle_report_by_token((string)($b['token']??''));if(!$report)json_response(404,['error'=>'not_found','message'=>'Token not recognized.']);$msg=clean((string)($b['message']??''),3000);if(mb_strlen($msg)<2)json_response(400,['error'=>'invalid_message','message'=>'Enter a message.']);$pdo=whistle_db();$now=now_iso();$pdo->beginTransaction();try{insert_whistle_message($pdo,(string)$report['id'],'reporter',$msg,null,$now);$stmt=$pdo->prepare("UPDATE whistleblowing_reports SET status='in_progress' WHERE id=?");$stmt->execute([$report['id']]);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}$to=envv('WHISTLEBLOWING_EMAIL',db_setting_get());if($to){try{send_email($to,'Whistleblowing follow-up received','A reporter added a message. Sign in to the admin panel.');}catch(Throwable $e){error_log('Whistleblowing notification failed: '.$e->getMessage());}}else{error_log('Whistleblowing notification skipped: no recipient configured.');}json_response(201,['ok'=>true]);
}
function admin_whistle_message(string $id,array $user): never {
    $b=body_json();$msg=clean((string)($b['message']??''),3000);if(mb_strlen($msg)<2)json_response(400,['error'=>'invalid_message','message'=>'Enter a response.']);$pdo=whistle_db();$stmt=$pdo->prepare('SELECT email FROM whistleblowing_reports WHERE id=?');$stmt->execute([$id]);$email=$stmt->fetchColumn();if($email===false)json_response(404,['error'=>'not_found','message'=>'Report not found.']);$now=now_iso();$pdo->beginTransaction();try{insert_whistle_message($pdo,$id,'admin',$msg,(string)$user['email'],$now);$stmt=$pdo->prepare("UPDATE whistleblowing_reports SET status='in_progress' WHERE id=?");$stmt->execute([$id]);$pdo->commit();}catch(Throwable $e){$pdo->rollBack();throw $e;}if($email){try{send_email((string)$email,'A response to your whistleblowing report','A response is available. Return to the whistleblowing page and enter your token.');}catch(Throwable $e){error_log('Whistleblowing response notification failed: '.$e->getMessage());}}json_response(201,['ok'=>true]);
}
function admin_whistle_status(string $id): never {
    $b=body_json();$status=(string)($b['status']??'');
    if(!in_array($status,['in_progress','closed'],true))json_response(400,['error'=>'invalid_status','message'=>'Choose open or closed status.']);
    $pdo=whistle_db();$stmt=$pdo->prepare('SELECT id FROM whistleblowing_reports WHERE id=?');$stmt->execute([$id]);
    if(!$stmt->fetchColumn())json_response(404,['error'=>'not_found','message'=>'Report not found.']);
    $stmt=$pdo->prepare('UPDATE whistleblowing_reports SET status=? WHERE id=?');$stmt->execute([$status,$id]);
    json_response(200,['ok'=>true,'status'=>$status]);
}
function create_lead(): never { $b=body_json();if(clean((string)($b['company']??''),200)!=='')json_response(200,['ok'=>true,'message'=>lead_message(locale_norm($b['locale']??''))]);$payload=[];foreach($b as $k=>$v)if($k!=='company')$payload[$k]=is_string($v)?clean($v,2000):$v;$locale=locale_norm($b['locale']??'')?:'en';$form=clean((string)($b['formName']??''),160);$email=email_norm((string)($b['email']??''));$subject=clean((string)($b['subject']??''),200);if($subject==='')$subject=$form!==''?$form:'Website query';$lead=['id'=>uuid(),'locale'=>$locale,'formName'=>$form,'subject'=>$subject,'status'=>'new','pageUrl'=>clean((string)($b['pageUrl']??''),500),'name'=>clean((string)($b['name']??''),160),'phone'=>clean((string)($b['phone']??''),80),'email'=>$email,'province'=>clean((string)($b['province']??''),160),'district'=>clean((string)($b['district']??''),160),'consent'=>in_array($b['consent']??false,[true,'true','1','on',1],true),'payload'=>$payload,'ipAddress'=>request_ip(),'userAgent'=>clean((string)($_SERVER['HTTP_USER_AGENT']??''),500),'createdAt'=>now_iso()];if(mb_strlen($lead['name'])<2)json_response(400,['error'=>'invalid_lead','message'=>'Name is required.']);if(!$lead['phone']&&!$email)json_response(400,['error'=>'invalid_lead','message'=>'Phone or email is required.']);if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))json_response(400,['error'=>'invalid_lead','message'=>'Email address is not valid.']);if(!$lead['consent'])json_response(400,['error'=>'invalid_lead','message'=>'Consent is required.']);$rows=read_store('leads');$rows[]=$lead;write_store('leads',$rows);try{notify_lead($lead);}catch(Throwable $e){error_log('Lead notification failed: '.$e->getMessage());}json_response(201,['ok'=>true,'message'=>lead_message($locale)]); }
function lead_message(string $locale): string { return $locale==='pt'?'Obrigado. O seu pedido foi enviado.':'Thank you. Your request has been sent.'; }
function lead_status(mixed $s): string { return in_array($s,['new','in_progress','resolved'],true)?$s:'new'; }
function normalize_article(array $b,?array $old,string $email): array { $now=now_iso();$status=($b['status']??'')==='published'?'published':'draft';$locale=locale_norm($b['locale']??'')?:'en';$title=clean((string)($b['title']??''),160);$id=$old['id']??uuid();$slug=slugify(clean((string)($b['slug']??''),140)?:$title)?:$id;$content=sanitize_article(clean((string)($b['content']??''),50000));$was=($old['status']??'')==='published';return ['id'=>$id,'title'=>$title,'slug'=>$slug,'locale'=>$locale,'summary'=>clean((string)($b['summary']??''),500),'content'=>$content,'imageUrl'=>clean((string)($b['imageUrl']??''),500),'status'=>$status,'authorEmail'=>$old['authorEmail']??$email,'updatedBy'=>$email,'createdAt'=>$old['createdAt']??$now,'updatedAt'=>$now,'publishedAt'=>$status==='published'?($old['publishedAt']??$now):null,'unpublishedAt'=>$was&&$status==='draft'?$now:($old['unpublishedAt']??null)]; }
function save_article(?string $id,array $user): never { $b=body_json();$rows=read_store('articles');$idx=null;$old=null;foreach($rows as $i=>$a)if($a['id']===$id&&$id!==null){$idx=$i;$old=$a;break;}if($id!==null&&$old===null)json_response(404,['error'=>'not_found','message'=>'Article not found.']);$a=normalize_article($b,$old,$user['email']);if(mb_strlen($a['title'])<3)json_response(400,['error'=>'invalid_article','message'=>'Title must be at least 3 characters.']);if(mb_strlen(article_plain($a['content']))<20)json_response(400,['error'=>'invalid_article','message'=>'Article content must be at least 20 characters.']);if(!in_array($a['locale'],['en','pt'],true))json_response(400,['error'=>'invalid_article','message'=>'Locale must be English or Portuguese.']);if($a['imageUrl']&&!safe_image($a['imageUrl']))json_response(400,['error'=>'invalid_article','message'=>'Image URL must be an http(s) URL or a local /img path.']);foreach($rows as $other)if($other['id']!==$a['id']&&$other['locale']===$a['locale']&&$other['slug']===$a['slug'])json_response(400,['error'=>'invalid_article','message'=>'Another article already uses that slug in this language.']);if($idx===null)$rows[]=$a;else$rows[$idx]=$a;write_store('articles',$rows);json_response($id?200:201,['article'=>$a]); }
function normalize_product(array $b,?array $old,string $email): array { $now=now_iso();$status=($b['status']??'')==='published'?'published':'draft';$props=normalize_properties($b['properties']??[]);$price=normalize_price($b['price']??null);$oldPrice=normalize_price($b['oldPrice']??null);return ['id'=>$old['id']??uuid(),'locale'=>locale_norm($b['locale']??'')?:'en','name'=>clean((string)($b['name']??''),160),'description'=>clean((string)($b['description']??''),2000),'availability'=>in_array($b['availability']??'', ['available','limited','out_of_stock','coming_soon'],true)?$b['availability']:'available','properties'=>$props,'imageUrl'=>clean((string)($b['imageUrl']??''),500),'price'=>$price,'oldPrice'=>$oldPrice,'currency'=>clean((string)($b['currency']??''),12)?:'MZN','status'=>$status,'authorEmail'=>$old['authorEmail']??$email,'updatedBy'=>$email,'createdAt'=>$old['createdAt']??$now,'updatedAt'=>$now,'publishedAt'=>$status==='published'?($old['publishedAt']??$now):null,'unpublishedAt'=>($old['status']??'')==='published'&&$status==='draft'?$now:($old['unpublishedAt']??null)]; }
function normalize_price(mixed $v): ?float { $s=str_replace(',','',trim((string)($v??'')));if($s===''||!is_numeric($s))return null;return round((float)$s,2); }
function save_product(?string $id,array $user): never { $b=body_json();$rows=read_store('products');$idx=null;$old=null;foreach($rows as $i=>$p)if($p['id']===$id&&$id!==null){$idx=$i;$old=$p;break;}if($id!==null&&$old===null)json_response(404,['error'=>'not_found','message'=>'Product not found.']);$p=normalize_product($b,$old,$user['email']);$error='';if(mb_strlen($p['name'])<2)$error='Product name is required.';elseif(mb_strlen($p['description'])<10)$error='Product description must be at least 10 characters.';elseif(!in_array($p['locale'],['en','pt'],true))$error='Locale must be English or Portuguese.';elseif(!in_array($p['currency'],['MZN','USD'],true))$error='Currency must be MZN or USD.';elseif(count($p['properties'])>5)$error='A product can have at most five properties.';elseif($p['price']===null||$p['price']<0)$error='Current price must be 0 or greater.';elseif($p['oldPrice']!==null&&$p['oldPrice']<0)$error='Old price must be 0 or greater.';elseif($p['imageUrl']&&!safe_image($p['imageUrl']))$error='Image URL must be an http(s) URL or a local /img path.';else{$keys=[];foreach($p['properties'] as $prop){if(!$prop['key']||!$prop['value']){$error='Each property needs both a name and a value.';break;}$key=mb_strtolower($prop['key']);if(isset($keys[$key])){$error='Property names must be unique.';break;}$keys[$key]=true;}}if($error)json_response(400,['error'=>'invalid_product','message'=>$error]);if($idx===null)$rows[]=$p;else$rows[$idx]=$p;write_store('products',$rows);json_response($id?200:201,['product'=>$p]); }
function delete_record(string $name,string $id): never { $rows=read_store($name);$next=array_values(array_filter($rows,fn($r)=>$r['id']!==$id));if(count($rows)===count($next))json_response(404,['error'=>'not_found','message'=>ucfirst(rtrim($name,'s')).' not found.']);write_store($name,$next);json_response(200,['ok'=>true]); }
function upload_image(): never {
    $file = $_FILES['upload'] ?? $_FILES['image'] ?? $_FILES['file'] ?? null;
    $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    if ($error === UPLOAD_ERR_NO_FILE) {
        json_response(400, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'Choose an image to upload.']);
    }
    if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || ($file['size'] ?? 0) > MAX_UPLOAD_BYTES) {
        json_response(413, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'Image must be 5 MB or smaller and within the server upload limit.']);
    }
    if ($error !== UPLOAD_ERR_OK) {
        json_response(400, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'Image upload failed.']);
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extension = ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/gif' => '.gif', 'image/webp' => '.webp'][$mime] ?? '';
    if (!$extension || !@getimagesize($file['tmp_name'])) {
        json_response(415, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'Image must be JPEG, PNG, GIF or WebP.']);
    }

    $base = slugify(pathinfo((string)$file['name'], PATHINFO_FILENAME));
    $name = gmdate('Y-m-d') . '-' . uuid() . '-' . substr($base ?: 'image', 0, 60) . $extension;
    $imagePath = '/img/uploads/articles';
    $directory = API_ROOT . $imagePath;
    $destination = $directory . '/' . $name;
    if ((!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) ||
        !@move_uploaded_file($file['tmp_name'], $destination)) {
        json_response(500, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'The server could not save the image to the uploads directory.']);
    }
    if (!chmod($destination, 0644)) {
        unlink($destination);
        json_response(500, ['uploaded' => 0, 'error' => 'invalid_upload', 'message' => 'The server could not make the uploaded image readable.']);
    }
    json_response(201, ['uploaded' => 1, 'fileName' => $name, 'url' => $imagePath . '/' . $name]);
}

if (PHP_SAPI !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') json_response(404,['error'=>'not_found','message'=>'Endpoint not found.']);
