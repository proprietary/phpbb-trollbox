'use strict';

const trollboxMessageRowTemplate = document.createElement('template');
trollboxMessageRowTemplate.innerHTML = `
<style>
time {
  color: gray;
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
	}

	_handleSubmit(evt) {
		evt.preventDefault();
		evt.target.checkValidity();
		const messageInputField = evt.target.querySelector('textarea');
		const message = messageInputField.value + '';
		console.info(`submitting: ${evt.target.querySelector('textarea').value}`);
		messageInputField.value = '';
		this.dispatchEvent(
			new CustomEvent('TrollboxSubmitMessage', { bubbles: true, composed: true, detail: { message: message } })
		);
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
				evt.target.form.dispatchEvent(new Event('submit', { cancelable: true }));
			}
		}
	}
}

customElements.define('tb-input', TrollboxInput);

const trollboxTemplate = document.createElement('template');
trollboxTemplate.innerHTML = `
<style>
:host {
  display: block;
}

* {
  font-family: sans-serif;
}

.container {
  background-color: maroon;
  border-radius: 1rem;
  color: white;
  padding: 0.5rem 1rem 1rem 1rem;
}

[data-id="messages"] {
  overflow-y: scroll;
  height: 300px;
}

header {
  cursor: pointer;
}

main tb-input {
  padding-top: 1rem;
}
</style>
<div class="container">
  <header>
    <h2>Trollbox</h2>
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
	}

	connectedCallback() {
		this.shadowRoot.addEventListener('TrollboxSubmitMessage', this._handleSubmitMessage);
		this.shadowRoot.querySelector('header').addEventListener('click', this._toggleVisibility);
	}

	disconnectedCallback() {
		this.shadowRoot.addEventListener('TrollboxSubmitMessage', this._handleSubmitMessage);
	}

	_addMessage(msg) {
		const newMessageElement = document.createElement('tb-message-row');
		newMessageElement.setAttribute('author', msg.author);
		newMessageElement.setAttribute('message', msg.message);
		newMessageElement.setAttribute('timestamp', msg.timestamp);
		const messagesContainer = this.shadowRoot.querySelector('[data-id="messages"]');
		messagesContainer.appendChild(newMessageElement);
		// scroll down to the latest message
		messagesContainer.scrollTop = messagesContainer.scrollHeight - messagesContainer.clientHeight;
	}

	_handleSubmitMessage = (evt) => {
		evt.stopPropagation();
		console.info(`received message in parent: ${evt.detail.message}`);
		this._addMessage({
			author: 'me (TODO)',
			message: evt.detail.message,
			timestamp: new Date().toISOString(),
		});
	}

	_toggleVisibility = (evt) => {
		const body = this.shadowRoot.querySelector('main');
		if (body.style.visibility === '' || body.style.visibility === 'visible') {
			body.style.visibility = 'hidden';
			body.style.maxHeight = '10px';
		} else if (body.style.visibility === 'hidden') {
			body.style.visibility = 'visible';
			body.style.maxHeight = '';
		}
	}
}

customElements.define('tb-trollbox', Trollbox);
