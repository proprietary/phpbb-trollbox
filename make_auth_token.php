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

if ($user->data['user_id'] != ANONYMOUS) {
	$payload = time() . '.' . $user->data['username'];
	$payload_hash = hash("sha256", $payload . $TROLLBOX_SECRET);
	$message = $payload_hash . '.' . $payload;
	echo $message;
}

?>
