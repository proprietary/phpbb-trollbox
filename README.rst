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

   Then deploy this WebSockets application behind a reverse proxy or load balancer, which should do the TLS termination.
   
.. code-block:: bash

   cargo build --release
   # copy to remote server
   # scp, rsync, CI/CD, etc.
   scp target/release/trollbox my-remote-server.com:/srv/trollbox/

2. Set environment variables for the chat server application:

   - ``TROLLBOX_SECRET``: a random token

3. Set a ``$TROLLBOX_SECRET`` variable in ``/config.php`` of your phpBB3 directory root, which must have the same value as ``TROLLBOX_SECRET`` on the server.

   Needless to say, never expose this secret token to anyone or they could impersonate other users in your chat. This facilitates verifying the user's identity without needing to give any database access to the chat server.

4. Copy ``frontend/trollbox.js`` and ``make_auth_token.php`` files to your phpBB3 directory root

5. Include the chatbox in the phpBB3 template code; e.g. in ``/styles/prosilver/index_body.html`` if you wish to only display the chat on the homepage::

	 <!-- IF S_REGISTERED_USER -->
	 <script src="/trollbox.js"></script>
	 <div>
	     <tb-trollbox serverEndpoint="wss://my-remote-server.com/ws" authEndpoint="/make_auth_token.php"></tb-trollbox>
	 </div>
	 <!-- ENDIF -->

.. _Rust: https://www.rust-lang.org/
