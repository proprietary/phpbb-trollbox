<?php

// Usage:
// $TROLLBOX_SECRET must be set in config.php

define('IN_PHPBB', true);
$phpbb_root_path = (defined('PHPBB_ROOT_PATH')) ? PHPBB_ROOT_PATH : './';
$phpEx = substr(strrchr(__FILE__, '.'), 1);
require($phpbb_root_path . 'common.' . $phpEx);

$user->session_begin();
$auth->acl($user->data);
$user->setup();

function is_banned($user_id) {
	global $user;
	if ($user_id === false) {
		throw new Exception('bad user id');
	}
	return $user->check_ban($user_id, false, false, true) ? true : false;
}

function base64_encode_urlsafe($data) {
	return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

if ($user->data['user_id'] != ANONYMOUS && !is_banned($user->data['user_id'])) {
	$credentials = new stdClass();
	$signed_credentials = new stdClass();
	$credentials->timestamp = time();
	$credentials->username = $user->data['username'];
	$credentials->uid = $user->data['user_id'];
	if ($auth->acl_get('m_')) {
		$credentials->role = 'mod';
	} elseif ($auth->acl_get('a_')) {
		$credentials->role = 'admin';
	} else {
		$credentials->role = 'user';
	}
	$encoded_credentials = json_encode($credentials);
	$signed_credentials->signature = hash('sha256', $encoded_credentials . TROLLBOX_SECRET);
	$signed_credentials->credentials = $credentials;
	echo base64_encode_urlsafe(json_encode($signed_credentials));
}

?>
