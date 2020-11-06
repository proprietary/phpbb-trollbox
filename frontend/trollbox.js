'use strict';

const trollboxMessageRowTemplate = document.createElement('template');
trollboxMessageRowTemplate.innerHTML = `
<style>
time {
  color: gray;
}

.message {
  white-space: pre-wrap;
}

:host {
  font-size: 1.1em;
}
</style>
<p>
  <strong class="author"></strong>: <span class="message"></span> <time></time>
</p>
`

class TrollboxMessageRow extends HTMLElement {
	static get observedAttributes() {
		return ["author", "message", "timestamp"];
	}

	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.appendChild(trollboxMessageRowTemplate.content.cloneNode(true));
	}

	connectedCallback() {
		const shadow = this.shadowRoot;
		shadow.querySelector('.author').textContent = this.getAttribute('author');
		shadow.querySelector('.message').textContent = this.getAttribute('message');
		const t = new Date(this.getAttribute('timestamp'));
		const dt = shadow.querySelector('time');
		dt.setAttribute('datetime', t.toISOString());
		dt.textContent = t.toLocaleString();
		
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

  button {
    font-size: 1.5rem;
  }

  form {
    display: flex;
    flex-flow: row nowrap;
    justify-content: flex-end;
    width: 100%;
  }
</style>
<form validate>
  <textarea required placeholder="Write your message here"></textarea>
  <button type="submit">Send</button>
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
	}

	disconnectedCallback() {
		this.shadowRoot.querySelector('form').removeEventListener('submit', this._handleSubmit);
		this.shadowRoot.querySelector('textarea').removeEventListener('keydown', this._handleKeyPress);
	}

	_handleSubmit = (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		const messageInputField = this.shadowRoot.querySelector('textarea');
		if (messageInputField.reportValidity() === true && messageInputField.value.length > 0) {
			const message = messageInputField.value + '';
			this.dispatchEvent(
				new CustomEvent('TrollboxSubmitMessage', { bubbles: true, composed: true, detail: { message: message } })
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
				evt.target.form.dispatchEvent(new SubmitEvent('submit', { submitter: evt.target }));
			}
		}
	}
}

customElements.define('tb-input', TrollboxInput);

const trollboxTemplate = document.createElement('template');
trollboxTemplate.innerHTML = `
<style>
@media only screen and (max-width: 600px) {
  :host {
    max-width: 80vw;
  }
}

@media only screen and (min-width: 600px) {
  :host {
    max-width: 60vw;
  }
}

@media only screen and (min-width: 768px) {
  :host {
    max-width: 50vw;
  }
}

@media only screen and (min-width: 992px) {
  :host {
    max-width: 30vw;
  }
}

@media only screen and (min-width: 1200px) {
  :host {
    max-width: 20vw;
  }
}

:host {
  display: block;
  padding: 0;
  margin: 0;
}

* {
  font-family: sans-serif;
}

.container {
  background-color: maroon;
  border-radius: 1rem;
  color: white;
  padding: 0.1rem 0.5rem 0.5rem 0.5rem;
}

[data-id="messages"] {
  overflow-y: scroll;
  min-height: 30vh;
}

header {
  cursor: pointer;
}

tb-input {
  margin-top: 1rem;
}
</style>
<div class="container">
  <header>
    <h2>DW Chat</h2>
  </header>
  <main>
    <div data-id="messages">
    </div>
    <tb-input></tb-input>
  </main>
</div>
`;

class Trollbox extends HTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.appendChild(trollboxTemplate.content.cloneNode(true));
		this.socket = null;
	}

	get serverEndpoint() {
		return this.getAttribute('serverEndpoint');
	}

	get authEndpoint() {
		return this.getAttribute('authEndpoint');
	}


	connectedCallback() {
		this.shadowRoot.addEventListener('TrollboxSubmitMessage', this._handleSubmitMessage);
		this.shadowRoot.querySelector('header').addEventListener('click', this._toggleVisibility);
		this._toggleVisibility(this.shadowRoot.querySelector('header'));
		this._authenticate().then(() => {
			this._openConnection();
		});
	}

	disconnectedCallback() {
		this.shadowRoot.addEventListener('TrollboxSubmitMessage', this._handleSubmitMessage);
		this._closeConnection();
	}


	async _authenticate() {
		try {
			const authToken = await fetch(this.authEndpoint).then(resp => resp.text());
			if (authToken.length === 0) {
				throw new Error(`Received no auth token`);
			}
			const a = authToken.split('.');
			if (a.length >= 3) {
				this.authToken = { username: a[2], timestamp: parseInt(a[1]), signature: a[0] };
				// perform url-safe base64 encoding
				this.authToken = btoa(JSON.stringify(this.authToken));
				this.authToken = this.authToken.replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
			}
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
	}

	_closeConnection() {
		if (this.socket != null) {
			this.socket.removeEventListener('message', this._acceptRemoteMessage);
		}
	}

	_acceptRemoteMessage = (evt) => {
		const msg = JSON.parse(evt.data);
		if (Object.prototype.toString.call(msg) === '[object Array]') {
			msg.forEach(this._addMessage);
		} else {
			this._addMessage(msg);
		}
	}

	async _sendChatMessage(msg) {
		if (this.socket != null) {
			this.socket.send(JSON.stringify(msg));
		}
	}

	_addMessage = (msg) => {
		const newMessageElement = document.createElement('tb-message-row');
		newMessageElement.setAttribute('author', msg.author);
		newMessageElement.setAttribute('message', msg.text);
		newMessageElement.setAttribute('timestamp', new Date(parseInt(msg.timestamp) * 1000).toISOString());
		const messagesContainer = this.shadowRoot.querySelector('[data-id="messages"]');
		messagesContainer.appendChild(newMessageElement);
		// scroll down to the latest message
		messagesContainer.scrollTop = messagesContainer.scrollHeight - messagesContainer.clientHeight;
	}

	_handleSubmitMessage = (evt) => {
		evt.stopPropagation();
		const inputMessage = {
			text: evt.detail.message,
			timestamp: Math.floor(new Date().getTime() / 1000),
		};
		this._sendChatMessage(inputMessage);
	}

	_toggleVisibility = (evt) => {
		const body = this.shadowRoot.querySelector('main');
		if (body.style.visibility === '' || body.style.visibility === 'visible') {
			body.style.visibility = 'hidden';
			body.style.minHeight = '0px';
			body.style.height = '0px';
		} else if (body.style.visibility === 'hidden') {
			body.style.visibility = 'visible';
			body.style.minHeight = '30vh';
			body.style.height = '';
		}
	}
}

customElements.define('tb-trollbox', Trollbox);
