<?php
/**
 * Frontend customer authentication for a same-domain frontend.
 *
 * POST /api/frontend-auth.php JSON {action, ...}
 * Actions: register, login, me, logout, password.
 *
 * Admin authentication remains POST /api/admin.php with X-WX-ADM.
 * Frontend sessions use an HttpOnly wx_fe_session cookie and a readable
 * wx_fe_csrf cookie/header pair. Bearer wxfe_... is also accepted.
 */
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

const WX_FE_ROOT = __DIR__ . '/..';
const WX_FE_PRIVATE = WX_FE_ROOT . '/_private';
const WX_FE_DB = WX_FE_PRIVATE . '/db.json';
const WX_FE_SESSION_COOKIE = 'wx_fe_session';
const WX_FE_CSRF_COOKIE = 'wx_fe_csrf';
const WX_FE_SESSION_HOURS = 12;
const WX_FE_REMEMBER_DAYS = 30;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function wx_fe_out(array $data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); exit; }
function wx_fe_fail(string $message, int $code = 400): void { wx_fe_out(['ok' => false, 'error' => $message], $code); }
function wx_fe_input(): array { $data = json_decode((string)file_get_contents('php://input'), true); return is_array($data) ? $data : (is_array($_POST) ? $_POST : []); }
function wx_fe_now(): string { return date('Y-m-d H:i:s'); }
function wx_fe_ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
function wx_fe_clip($value, int $max): string { return mb_substr(trim(strip_tags((string)$value)), 0, $max); }
function wx_fe_hash(string $value): string { return hash('sha256', $value); }
function wx_fe_secure(): bool { return !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off'; }

function wx_fe_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $c = is_file(WX_FE_DB) ? json_decode((string)file_get_contents(WX_FE_DB), true) : null;
    if (!is_array($c) || empty($c['name']) || !isset($c['user'], $c['pass'])) wx_fe_fail('Frontend authentication is not configured', 503);
    try {
        $pdo = new PDO('mysql:host=' . (($c['host'] ?? '') ?: 'localhost') . ';dbname=' . $c['name'] . ';charset=utf8mb4', (string)$c['user'], (string)$c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    } catch (Throwable $e) { error_log('frontend-auth database: ' . $e->getMessage()); wx_fe_fail('Frontend authentication is temporarily unavailable', 503); }
    return $pdo;
}

function wx_fe_schema(): void {
    $db = wx_fe_db();
    $db->exec("CREATE TABLE IF NOT EXISTS wx_frontend_users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, email VARCHAR(190) NOT NULL UNIQUE, phone VARCHAR(40) NULL, pass_hash VARCHAR(255) NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, last_login DATETIME NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS wx_frontend_sessions (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE, csrf_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL, created_at DATETIME NOT NULL, last_seen DATETIME NULL, ip VARCHAR(64) NULL, user_agent VARCHAR(255) NULL, INDEX(user_id), INDEX(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function wx_fe_cookie(string $name, string $value, int $expires, bool $httpOnly): void {
    setcookie($name, $value, ['expires' => $expires, 'path' => '/', 'secure' => wx_fe_secure(), 'httponly' => $httpOnly, 'samesite' => 'Lax']);
}
function wx_fe_clear_cookies(): void { wx_fe_cookie(WX_FE_SESSION_COOKIE, '', time() - 3600, true); wx_fe_cookie(WX_FE_CSRF_COOKIE, '', time() - 3600, false); }
function wx_fe_user(array $u): array { return ['id' => (int)$u['id'], 'name' => (string)$u['name'], 'email' => (string)$u['email'], 'phone' => (string)($u['phone'] ?? ''), 'created_at' => (string)$u['created_at']]; }

function wx_fe_token(): string {
    $auth = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if (preg_match('~^Bearer\s+(wxfe_[A-Za-z0-9]+)$~i', $auth, $m)) return $m[1];
    return (string)($_COOKIE[WX_FE_SESSION_COOKIE] ?? '');
}
function wx_fe_session(bool $required = false): ?array {
    $raw = wx_fe_token();
    if (!preg_match('~^wxfe_[a-f0-9]{64}$~', $raw)) { if ($required) wx_fe_fail('Frontend sign-in required', 401); return null; }
    $st = wx_fe_db()->prepare('SELECT s.*, u.name, u.email, u.phone, u.created_at, u.active, u.pass_hash FROM wx_frontend_sessions s JOIN wx_frontend_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1');
    $st->execute([wx_fe_hash($raw), wx_fe_now()]); $row = $st->fetch();
    if (!$row) { if ($required) wx_fe_fail('Frontend session expired', 401); return null; }
    wx_fe_db()->prepare('UPDATE wx_frontend_sessions SET last_seen=? WHERE id=?')->execute([wx_fe_now(), $row['id']]);
    return $row + ['raw_token' => $raw];
}
function wx_fe_csrf(array $session): void {
    $sent = (string)($_SERVER['HTTP_X_WX_FE_CSRF'] ?? ''); $cookie = (string)($_COOKIE[WX_FE_CSRF_COOKIE] ?? '');
    if ($sent === '' || ($cookie !== '' && !hash_equals($cookie, $sent)) || !hash_equals((string)$session['csrf_hash'], wx_fe_hash($sent))) wx_fe_fail('Invalid frontend security token', 419);
}
function wx_fe_limit(string $prefix, int $max, int $window): void {
    $db = wx_fe_db(); $key = 'fe:' . $prefix . ':' . wx_fe_ip(); $st = $db->prepare('SELECT n,t FROM wx_throttle WHERE ip=?'); $st->execute([$key]); $r = $st->fetch();
    $n = ($r && time() - (int)$r['t'] < $window) ? (int)$r['n'] + 1 : 1; if ($n > $max) wx_fe_fail('Too many attempts. Please try again later.', 429);
    $db->prepare('REPLACE INTO wx_throttle (ip,n,t) VALUES (?,?,?)')->execute([$key, $n, $n === 1 ? time() : (int)$r['t']]);
}
function wx_fe_start(array $user, bool $remember, bool $bearer = false): array {
    $raw = 'wxfe_' . bin2hex(random_bytes(32)); $csrf = bin2hex(random_bytes(24)); $seconds = $remember ? WX_FE_REMEMBER_DAYS * 86400 : WX_FE_SESSION_HOURS * 3600; $expires = date('Y-m-d H:i:s', time() + $seconds);
    wx_fe_db()->prepare('INSERT INTO wx_frontend_sessions (user_id,token_hash,csrf_hash,expires_at,created_at,last_seen,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)')->execute([$user['id'], wx_fe_hash($raw), wx_fe_hash($csrf), $expires, wx_fe_now(), wx_fe_now(), wx_fe_ip(), substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255)]);
    wx_fe_cookie(WX_FE_SESSION_COOKIE, $raw, time() + $seconds, true); wx_fe_cookie(WX_FE_CSRF_COOKIE, $csrf, time() + $seconds, false);
    $result = ['ok' => true, 'user' => wx_fe_user($user), 'csrf' => $csrf, 'auth' => 'cookie', 'expires_at' => $expires]; if ($bearer) $result['access_token'] = $raw; return $result;
}

wx_fe_schema(); $in = wx_fe_input(); $action = (string)($in['action'] ?? 'me'); $db = wx_fe_db();
try {
    switch ($action) {
        case 'register':
            wx_fe_limit('register', 5, 900); $name = wx_fe_clip($in['name'] ?? '', 120); $email = strtolower(trim((string)($in['email'] ?? ''))); $phone = wx_fe_clip($in['phone'] ?? '', 40); $password = (string)($in['password'] ?? '');
            if (mb_strlen($name) < 2) wx_fe_fail('Please enter your name'); if (!filter_var($email, FILTER_VALIDATE_EMAIL)) wx_fe_fail('Please enter a valid email address'); if (strlen($password) < 8) wx_fe_fail('Password must be at least 8 characters');
            $st = $db->prepare('SELECT id FROM wx_frontend_users WHERE email=?'); $st->execute([$email]); if ($st->fetch()) wx_fe_fail('Unable to create this account. Check the email or sign in.', 409);
            $db->prepare('INSERT INTO wx_frontend_users (name,email,phone,pass_hash,active,created_at) VALUES (?,?,?,?,1,?)')->execute([$name, $email, $phone ?: null, password_hash($password, PASSWORD_DEFAULT), wx_fe_now()]); $st = $db->prepare('SELECT * FROM wx_frontend_users WHERE id=?'); $st->execute([(int)$db->lastInsertId()]); wx_fe_out(wx_fe_start($st->fetch(), !empty($in['remember']), ($in['transport'] ?? '') === 'bearer'), 201);
        case 'login':
            wx_fe_limit('login', 8, 600); $email = strtolower(trim((string)($in['email'] ?? ''))); $password = (string)($in['password'] ?? ''); $st = $db->prepare('SELECT * FROM wx_frontend_users WHERE email=? AND active=1'); $st->execute([$email]); $user = $st->fetch();
            if (!$user || !password_verify($password, (string)$user['pass_hash'])) wx_fe_fail('Email or password is incorrect', 401); $db->prepare('UPDATE wx_frontend_users SET last_login=? WHERE id=?')->execute([wx_fe_now(), $user['id']]); wx_fe_out(wx_fe_start($user, !empty($in['remember']), ($in['transport'] ?? '') === 'bearer'));
        case 'me':
            $session = wx_fe_session(true); wx_fe_out(['ok' => true, 'user' => wx_fe_user($session), 'auth' => 'cookie-or-bearer']);
        case 'logout':
            $session = wx_fe_session(false); if ($session) $db->prepare('DELETE FROM wx_frontend_sessions WHERE id=?')->execute([$session['id']]); wx_fe_clear_cookies(); wx_fe_out(['ok' => true]);
        case 'password':
            $session = wx_fe_session(true); wx_fe_csrf($session); $current = (string)($in['current'] ?? ''); $next = (string)($in['next'] ?? ''); if (!password_verify($current, (string)$session['pass_hash'])) wx_fe_fail('Current password is incorrect', 401); if (strlen($next) < 8) wx_fe_fail('Password must be at least 8 characters');
            $db->prepare('UPDATE wx_frontend_users SET pass_hash=? WHERE id=?')->execute([password_hash($next, PASSWORD_DEFAULT), $session['user_id']]); $db->prepare('DELETE FROM wx_frontend_sessions WHERE user_id=?')->execute([$session['user_id']]); $st = $db->prepare('SELECT * FROM wx_frontend_users WHERE id=?'); $st->execute([$session['user_id']]); wx_fe_out(wx_fe_start($st->fetch(), false, false));
        default: wx_fe_fail('Unknown frontend authentication action', 404);
    }
} catch (PDOException $e) { error_log('frontend-auth query: ' . $e->getMessage()); wx_fe_fail('Frontend authentication is temporarily unavailable', 503); }
