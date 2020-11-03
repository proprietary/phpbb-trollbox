'use strict';

class TrollboxMessageRow extends HTMLElement {
	static get observedAttributes() {
		return ["author", "message"];
	}

	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		shadow.innerHTML = `<p><span class="author"></span>: <span class="message"></span></p>`
	}

	connectedCallback() {
		const shadow = this.shadowRoot;
		shadow.querySelector('.author').textContent = this.getAttribute('author');
		shadow.querySelector('.message').textContent = this.getAttribute('message');
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
    display: inline-block;
  }
</style>
<form>
  <input type="text" required placeholder="Write your message here" />
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
	}

	disconnectedCallback() {
		this.shadowRoot.querySelector('form').removeEventListener('submit', this._handleSubmit);
	}

	_handleSubmit(evt) {
		evt.preventDefault();
		const messageInputField = evt.target.querySelector('input');
		const message = messageInputField.value + '';
		console.info(`submitting: ${evt.target.querySelector('input').value}`);
		messageInputField.value = '';
		this.dispatchEvent(
			new CustomEvent('TrollboxSubmitMessage', { bubbles: true, composed: true, detail: { message: message } })
		);
	}
}

customElements.define('tb-input', TrollboxInput);

const trollboxTemplate = document.createElement('template');
trollboxTemplate.innerHTML = `
<div>
  <h2>Trollbox</h2>
  <div data-id="messages">
  </div>
  <tb-input></tb-input>
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
	}

	disconnectedCallback() {
		this.shadowRoot.addEventListener('TrollboxSubmitMessage', this._handleSubmitMessage);
	}

	_addMessage(msg) {
		const newMessageElement = document.createElement('tb-message-row');
		newMessageElement.setAttribute('author', msg.author);
		newMessageElement.setAttribute('message', msg.message);
		this.shadowRoot.querySelector('[data-id="messages"]').appendChild(newMessageElement);
	}

	_handleSubmitMessage = (evt) => {
		evt.stopPropagation();
		console.info(`received message in parent: ${evt.detail.message}`);
		this._addMessage({ author: 'me (TODO)', message: evt.detail.message });
	}
}

customElements.define('tb-trollbox', Trollbox);
