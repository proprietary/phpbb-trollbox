--------------
phpBB Trollbox
--------------

This is a WebSockets chat module for integration with phpBB3 forums. It stores all the chat messages in memory, with no logging. There is a delete button beside each chat message for mods and admins to delete individual posts in real-time.

This was designed for a phpBB3 forum in a clustered environment, so the chat server should be on a domain or port distinct from the php one serving your phpBB3 forum. It does not alter or touch the database in any way. It is not a phpBB extension.

This was created because there were no real-time WebSockets chat libraries or extensions that could hook into phpBB3 easily. The alternatives were all based on AJAX long-polling and writing to the database. AJAX-based chat can be implemented conveniently in phpBB without the need for an external server, but it is very hard on server load and does not scale, not to mention how slow it is for users. I also did not want the chat system to have any access to the database for security purposes. Users are authenticated through a PHP script that does touch the database, but that runs on the same webroot as the phpBB installation, separate from the chat server.

This was an internal project. If people want to use this, I can make the installation process easier or more detailed. Drop a comment in the Issues to let me know.

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
   - ``TROLLBOX_PAST_MESSAGES_MAX_SIZE``: number of previous chat messages to retain and load to new users logging in

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
