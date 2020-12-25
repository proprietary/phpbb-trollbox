--------------
phpBB Trollbox
--------------

This is a WebSockets chat module for integration with phpBB3 forums. It stores all the chat messages in memory, with no logging, so although there are no moderation features, messages are not retained for very long. This was designed for a phpBB3 forum in a clustered environment, so the chat server should be on a domain or port distinct from the php one serving your phpBB3 forum. It does not alter or touch the database in any way. It is not a phpBB extension.

This was created because there were no realtime WebSockets chat libraries or extensions that could hook into phpBB3 easily. The alternatives were all based on AJAX long-polling and writing to the database.

At the moment, the code is very janky but works enough for my purposes. If other people find this useful, I may improve it. Drop a comment in Issues to let me know.

============
Installation
============

1. Compile server (requires a stable Rust_ toolchain)

.. code-block:: bash

   cargo build --release
   # copy to remote server
   # scp, rsync, CI/CD, etc.
   scp target/release/trollbox my-remote-server.com:/srv/trollbox/

Run this WebSockets application behind a reverse proxy or load balancer, which should do the TLS termination.
2. Copy ``frontend/trollbox.js`` and ``make_auth_token.php`` files to your phpBB3 directory root

3. Include the chatbox in the phpBB3 template code; e.g. in ``/var/www/html/styles/prosilver/index_body.html``::

	 <!-- IF S_REGISTERED_USER -->
	 <script src="/trollbox.js"></script>
	 <div>
	     <tb-trollbox serverEndpoint="wss://my-remote-server.com/ws" authEndpoint="/make_auth_token.php"></tb-trollbox>
	 </div>

.. _Rust: https://www.rust-lang.org/
