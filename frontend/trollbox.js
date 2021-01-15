'use strict';

const trollboxMessageRowTemplate = document.createElement('template');
trollboxMessageRowTemplate.innerHTML = `
<style>
time {
  color: darkgray;
}

.message {
  white-space: pre-wrap;
}

.author {
  cursor: pointer;
}

.delete-button {
  visibility: hidden;
}

:host {
  font-size: 1.1em;
}
</style>
<div>
  <strong class="author"></strong>: <span class="message"></span> <time></time>
  <button class="delete-button">Delete</button>
</div>
`

/* TODO: Show user profile pictures */
/* TODO: click user profile picture to link to profile page */

class TrollboxMessageRow extends HTMLElement {
	static get observedAttributes() {
		return ["author", "message", "timestamp", "message-id", "viewer-role"];
	}

	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.appendChild(trollboxMessageRowTemplate.content.cloneNode(true));
	}

	connectedCallback() {
		const shadow = this.shadowRoot;
		shadow.querySelector('.author').textContent = this.getAttribute('author');
		shadow.querySelector('.message').innerHTML = this.getAttribute('message');
		const t = new Date(this.getAttribute('timestamp'));
		const dt = shadow.querySelector('time');
		dt.setAttribute('datetime', t.toISOString());
		dt.textContent = t.toLocaleString();
		if (this.getAttribute('viewer-role') === 'mod' || this.getAttribute('viewer-role') === 'admin') {
			const deleteButton = shadow.querySelector('.delete-button');
			deleteButton.style.visibility = 'visible';
			deleteButton.addEventListener('click', this._handleDeleteButtonClick);
		}
		shadow.querySelector('.author').addEventListener('click', this._handleAuthorNameClick);
	}

	disconnectedCallback() {
		if (this.getAttribute('viewer-role') === 'mod' || this.getAttribute('viewer-role') === 'admin') {
			const deleteButton = this.shadowRoot.querySelector('.delete-button');
			deleteButton.removeEventListener('click', this._handleDeleteButtonClick);
		}
		this.shadowRoot.querySelector('.author').removeEventListener('click', this._handleAuthorNameClick);
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue === newValue) {
			return;
		}
		const shadow = this.shadowRoot;
		switch (name) {
		case 'author':
			shadow.querySelector('.author').textContent = newValue;
			break;
		case 'message':
			shadow.querySelector('.message').textContent = newValue;
			break;
		}
	}

	_handleDeleteButtonClick = (evt) => {
		evt.stopPropagation();
		this.dispatchEvent(new CustomEvent('Trollbox-Delete-Message', {bubbles: true, composed: false, detail: {messageId: this.getAttribute('message-id')}}));
	}

	_handleAuthorNameClick = (evt) => {
		evt.stopPropagation();
		this.dispatchEvent(new CustomEvent('Trollbox-Quote-Author', {bubbles: true, composed: false, detail: {author_name: this.getAttribute('author')}}));
	}
}

customElements.define('tb-message-row', TrollboxMessageRow);

const trollboxInputTemplate = document.createElement('template');
trollboxInputTemplate.innerHTML = `
<style>
  :host {
    display: block;
  }

  textarea {
    font-size: 1.5em;
    flex-basis: 100%;
  }

  form {
    display: flex;
    flex-flow: row nowrap;
    justify-content: flex-end;
    width: 100%;
  }
</style>
<form>
  <textarea required placeholder="Write your message here"></textarea>
</form>`;

class TrollboxInput extends HTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.appendChild(trollboxInputTemplate.content.cloneNode(true));
	}

	connectedCallback() {
		this.shadowRoot.querySelector('form').addEventListener('submit', this._handleSubmit);
		this.shadowRoot.querySelector('textarea').addEventListener('keydown', this._handleKeyPress);
		this.shadowRoot.addEventListener('Trollbox-Quote-Author', this._handleQuoteAuthor);
	}

	disconnectedCallback() {
		this.shadowRoot.querySelector('form').removeEventListener('submit', this._handleSubmit);
		this.shadowRoot.querySelector('textarea').removeEventListener('keydown', this._handleKeyPress);
		this.shadowRoot.removeEventListener('Trollbox-Quote-Author', this._handleQuoteAuthor);
	}

	_handleSubmit = (evt) => {
		evt.preventDefault();
		const messageInputField = this.shadowRoot.querySelector('textarea');
		if (messageInputField.reportValidity() === true && messageInputField.value.length > 0) {
			const message = messageInputField.value + '';
			this.dispatchEvent(
				new CustomEvent('Trollbox-Submit-Message', { bubbles: true, composed: false, detail: { message: message } })
			);
			messageInputField.value = '';
		}
	}

	_handleKeyPress = (evt) => {
		// Submit the chat message when user presses Enter.
		// Ignores Shift+Enter, which writes the newline as expected into the textarea.
		if ((evt.which === 13 || evt.key === 'Enter') && !evt.shiftKey) {
			// prevent insertion of literal newline
			evt.preventDefault();
			// Do not submit on empty input
			if (evt.target.reportValidity() === true) {
				// Submit form
				this._handleSubmit(new Event('submit', { submitter: evt.target }));
			}
		}
	}

	_handleQuoteAuthor = (evt) => {
		evt.stopPropagation();
		this.shadowRoot.querySelector('textarea').value = evt.detail.author_name + ': ' + this.shadowRoot.querySelector('textarea').value;
	}
}

customElements.define('tb-input', TrollboxInput);

const trollboxTemplate = document.createElement('template');
trollboxTemplate.innerHTML = `
<style>
:host {
  display: block;
  padding: 0;
  margin: 0;
}

* {
  font-family: sans-serif;
}

.container {
  background-color: #f5f7fa;
  border-radius: 1rem;
  color: black;
  padding: 0.1rem 0.5rem 0.5rem 0.5rem;
}

[data-id="messages"] {
  overflow-y: scroll;
  min-height: 30vh;
  max-height: 50vh;
}

tb-input {
  margin-top: 1rem;
}

[data-id="hide-chat-button"] {
  display: inline-block;
  color: darkgray;
}

[data-id="dw-chat-title"] {
  display: inline-block;
}
</style>
<div class="container">
  <header>
    <h2 data-id="dw-chat-title">DW Chat</h2>
    <a href="" data-id="hide-chat-button"></a>
  </header>
  <main>
    <div data-id="messages">
    </div>
    <tb-input></tb-input>
  </main>
</div>
`;

const POST_MESSAGE = "PostMessage";
const DELETE_MESSAGE = "DeleteMessage";

class Trollbox extends HTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.appendChild(trollboxTemplate.content.cloneNode(true));
		this.socket = null;
		this.reconnectTimeout = 1000;
		this.messages = [];
		this.credentials = {
			username: "",
			uid: -1,
			role: "",
			timestamp: ""
		};
	}

	get serverEndpoint() {
		return this.getAttribute('serverEndpoint');
	}

	get authEndpoint() {
		return this.getAttribute('authEndpoint');
	}

	get messagesContainer() {
		return this.shadowRoot.querySelector('[data-id="messages"]');
	}

	connectedCallback() {
		this.shadowRoot.addEventListener('Trollbox-Submit-Message', this._handleSubmitMessage);
		this.shadowRoot.addEventListener('Trollbox-Delete-Message', this._handleDeleteMessage);
		this.shadowRoot.addEventListener('Trollbox-Quote-Author', this._handleQuoteAuthor);
		const toggleHideChatButton = this.shadowRoot.querySelector('[data-id="hide-chat-button"]');
		toggleHideChatButton.addEventListener('click', this._handleToggleHideChat);
		if (this._hiddenByUser()) {
			toggleHideChatButton.textContent = 'Show chat';
			this._hideChat();
		} else {
			toggleHideChatButton.textContent = 'Hide chat';
		}
		this._authenticate().then(() => {
			this._openConnection();
		});
	}

	disconnectedCallback() {
		this.shadowRoot.removeEventListener('Trollbox-Submit-Message', this._handleSubmitMessage);
		this.shadowRoot.removeEventListener('Trollbox-Delete-Message', this._handleDeleteMessage);
		this.shadowRoot.removeEventListener('Trollbox-Quote-Author', this._handleQuoteAuthor);
		this._closeConnection();
	}

	_handleToggleHideChat = (evt) => {
		evt.preventDefault();
		const helpMessageElement = () => {
			const helpMessage = document.createElement('aside');
			helpMessage.textContent = 'You will no longer see the chat in this browser.';
			return helpMessage;
		};
		if (this._hiddenByUser()) {
			window.localStorage.setItem('COM_DHAMMAWHEEL_TROLLBOX_VISIBILITY', 'visible');
			this._showChat();
			evt.target.textContent = 'Hide chat';
			// remove the help message created when toggling hide
			evt.target.parentElement.querySelector('aside').remove();
		} else {
			window.localStorage.setItem('COM_DHAMMAWHEEL_TROLLBOX_VISIBILITY', 'hidden');
			this._hideChat();
			evt.target.textContent = 'Show chat';
			evt.target.insertAdjacentElement('afterend', helpMessageElement());
		}
	}

	_hideChat() {
		this.shadowRoot.querySelector('main').style.display = 'none';
	}

	_showChat() {
		this.shadowRoot.querySelector('main').style.display = 'block';
	}

	_hiddenByUser() {
		const h = window.localStorage.getItem('COM_DHAMMAWHEEL_TROLLBOX_VISIBILITY');
		return h !== null && h === 'hidden';
	}

	async _authenticate() {
		try {
			const signedCredentialsEncoded = await fetch(this.authEndpoint).then(resp => resp.text());
			if (signedCredentialsEncoded.length === 0) {
				throw new Error(`Received no auth token`);
			}
			this.authToken = signedCredentialsEncoded;
			// set local copy of this user's credentials
			const a = JSON.parse(window.atob(signedCredentialsEncoded));
			if (typeof a.signature === 'undefined' || typeof a.credentials === 'undefined') {
				throw new Error('incorrectly typed auth token');
			}
			this.credentials.username = a.credentials.username;
			this.credentials.uid = a.credentials.uid;
			this.credentials.role = a.credentials.role;
			this.credentials.timestamp = a.credentials.timestamp;
		} catch (e) {
			console.error(e);
		}
	}

	_openConnection() {
		if (this.authToken == null) {
			throw new Error(`Authenticate before opening connection to server`);
		}
		this.socket = new WebSocket(`${this.serverEndpoint}?auth=${this.authToken}`);
		this.socket.addEventListener('message', this._acceptRemoteMessage);
		this.socket.addEventListener('close', () => {
			console.info(`chat disconnected. reconnecting...`);
			setTimeout(this._openConnection.bind(this), this.reconnectTimeout);
			this.reconnectTimeout *= 2;
		});
		this.socket.addEventListener('error', (err) => {
			console.error(`chat error: ${err.message}; reconnecting...`);
			console.error(err);
			this.socket.close();
		});
	}

	_closeConnection() {
		if (this.socket != null) {
			this.socket.removeEventListener('message', this._acceptRemoteMessage);
		}
	}

	_acceptRemoteMessage = (evt) => {
		const msg = JSON.parse(evt.data);
		// payload could be a list of past messages, such as when first connecting
		if (Object.prototype.toString.call(msg) === '[object Array]') {
			if (this.messages.length === 0) {
				msg.forEach(this._addMessage);
				this.messages = msg;
			} else if (typeof this.messages !== 'undefined') {
				// find messages we missed while disconnected, if any
				const lastSavedMessage = this.messages[this.messages.length - 1];
				const firstUnseenMessageIdx = msg.findIndex((newMessage) => {
					return newMessage.id = lastSavedMessage.id;
				}) + 1;
				// insert only unseen messages
				for (let i = firstUnseenMessageIdx; i < msg.length; ++i) {
					this.messages.push(msg[i]);
					this._addMessage(msg[i]);
				}
			}
		} else if (typeof msg.action !== 'undefined') {
			switch (msg.action) {
			case POST_MESSAGE: {
				this._addMessage(msg.message);
				this.messages.push(msg);
				break;
			}
			case DELETE_MESSAGE: {
				this._deleteMessage(msg.message.id);
			}
			}
		} else if (typeof msg.error !== 'undefined' && msg.error.length > 0) {
			console.error(msg.error);
		}
	}

	async _sendWsMessage(msg) {
		if (this.socket != null) {
			this.socket.send(JSON.stringify(msg));
		}
	}

	static _filterText(text, filters) {
		filters.forEach((filter) => { text = filter(text); });
		return text;
	}

	_addMessage = (msg) => {
		msg.text = Trollbox._filterText(msg.text, [
			(text) => {
				// detect URLs and make them links
				const urlPattern = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/gi;
				text = text.replace(new RegExp(urlPattern), '<a href="$1" rel="nofollow" target="_blank">$1</a>');
				return text;
			},
			(text) => {
				// highlight quote replies to current user
				const regex = new RegExp('^(' + this.credentials.username + '): ');
				return text.replace(regex, '<mark>$1</mark>: ');
			}
		]);
		// insert into DOM
		const newMessageElement = document.createElement('tb-message-row');
		newMessageElement.setAttribute('author', msg['author_name']);
		newMessageElement.setAttribute('author-uid', msg['author_uid']);
		newMessageElement.setAttribute('message', msg['text']);
		newMessageElement.setAttribute('timestamp', new Date(parseInt(msg['timestamp']) * 1000).toISOString());
		newMessageElement.setAttribute('message-id', msg['id']);
		newMessageElement.setAttribute('viewer-role', this.credentials.role);
		const messagesContainer = this.messagesContainer;
		messagesContainer.appendChild(newMessageElement);
		// scroll down to the latest message
		messagesContainer.scrollTop = messagesContainer.scrollHeight - messagesContainer.clientHeight;
	}

	_deleteMessage = (messageId) => {
		const messagesContainer = this.messagesContainer;
		for (let messageElement of messagesContainer.children) {
			if (messageElement.getAttribute('message-id') === messageId) {
				messagesContainer.removeChild(messageElement);
				break;
			}
		}
	}

	_handleSubmitMessage = (evt) => {
		evt.stopPropagation();
		const inputChatAction = {
			action: POST_MESSAGE,
			message: {
				id: "",
				text: evt.detail.message,
				timestamp: Math.floor(new Date().getTime() / 1000),
				author_name: this.credentials.username,
				author_uid: this.credentials.uid,
				author_role: this.credentials.role
			}
		};
		this._sendWsMessage(inputChatAction);
	}

	_handleDeleteMessage = (evt) => {
		evt.stopPropagation();
		const inputChatAction = {
			action: DELETE_MESSAGE,
			message: {
				id: evt.detail.messageId,
				text: "",
				timestamp: 0,
				author_name: "",
				author_uid: 0,
				author_role: "",
			}
		};
		this._sendWsMessage(inputChatAction);
	}

	_handleQuoteAuthor = (evt) => {
		this.shadowRoot.querySelector('tb-input').shadowRoot.dispatchEvent(new CustomEvent('Trollbox-Quote-Author', {detail: evt.detail}));
	}
}

customElements.define('tb-trollbox', Trollbox);
