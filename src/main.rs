extern crate env_logger;
use trollbox::trollbox::auth::Credentials;
use trollbox::trollbox::msg::{InputChatMessage, OutputChatMessage};
use ws::{Handler, Handshake, Message, Request, Response, Result, Sender};
use ws::util::TcpStream;
use std::sync::{Arc, Mutex};
use std::collections::VecDeque;
use openssl::ssl::{SslAcceptor, SslMethod, SslStream};
use openssl::x509::X509;
use openssl::pkey::PKey;

const PAST_MESSAGES_MAX_SIZE: usize = 100;

// static HTML: &'static [u8] = br#"
// 	<!doctype html>
// 	<html>
// 	<head>
// 	  <meta charset="utf-8">
// 	</head>
// 	<body>
// 	  <pre id="messages"></pre>
// 	  <form id="chat_box">
// 	  <input type="text" id="msg"/>
// 	  <button type="submit">Send</button>
// 	  </form>
// 	  <script>
// 	  document.addEventListener("DOMContentLoaded", () => {
//         const auth_token = window.btoa(JSON.stringify({timestamp: Math.floor(new Date().getTime()/1000), username: "me", signature: ""}));
// 	  	const socket = new WebSocket("ws://" + window.location.host + "/ws", [auth_token]);
// 	  	socket.addEventListener("message", (evt) => {
// 	  	  const messages = document.getElementById("messages");
// 	  	  messages.append(evt.data + "\n");
// 	  	});
// 	  	document.getElementById("chat_box").addEventListener("submit", (evt) => {
// 	  	  evt.preventDefault();
// 	  	  const msgElement = document.getElementById("msg");
// 	  	  socket.send(JSON.stringify({username: "anonymous", text: msgElement.value, timestamp: 10000}));
// 	  	  msgElement.value = "";
// 	  	});
// 	  });
// 	</script>
// 	</body>
// 	</html>
// 	"#;

struct Server {
    out: Sender,
	tls_acceptor: std::rc::Rc<SslAcceptor>,
	credentials: Option<Credentials>,
	past_messages: Arc<Mutex<VecDeque<OutputChatMessage>>>,
}

impl Handler for Server {
    fn on_open(&mut self, handshake: Handshake) -> Result<()> { 
		// Authenticate user
		// get credential values from query string
		let hdr = match handshake.request.resource().split('?').last() {
			Some(query_string) => {
				match query_string.split('=').last() {
					Some(value) => value,
					None => {
						return self.out.close(ws::CloseCode::Error);
					}
				}
			}
			None => {
				return self.out.close(ws::CloseCode::Error);
			}
		};
		let creds: Credentials = match base64::decode_config(hdr, base64::URL_SAFE_NO_PAD) {
			Ok(creds_json) => serde_json::from_slice(&creds_json).unwrap(),
			Err(_) => {
				return self.out.close(ws::CloseCode::Error);
 			}
		};
		return if creds.check() {
			self.credentials = Some(creds);
			let h = Arc::clone(&self.past_messages);
			let v = h.lock().unwrap();
			let mut output: Vec<&OutputChatMessage> = vec![];
			for m in v.iter().rev() {
				output.push(m);
			}
			let output_string = serde_json::to_string(&output).unwrap();
			self.out.send(output_string)
		} else {
			self.out.close(ws::CloseCode::Error)
		}
    }

    fn on_message(&mut self, msg: Message) -> Result<()> {
		println!("on_message...");
		if let Some(_) = self.credentials {
			let input_chat_message: InputChatMessage = serde_json::from_str(msg.as_text().unwrap()).unwrap();
			let output_chat_message: OutputChatMessage = OutputChatMessage{
				author: self.credentials.as_ref().unwrap().username.clone(),
				text: input_chat_message.text.clone(),
				timestamp: std::time::SystemTime::now().duration_since(std::time::SystemTime::UNIX_EPOCH).unwrap().as_secs(),
			};
			let output = serde_json::to_string(&output_chat_message).unwrap();
			{
				let mut v = self.past_messages.lock().unwrap();
				v.push_front(output_chat_message);
				if v.len() > PAST_MESSAGES_MAX_SIZE {
					v.truncate(PAST_MESSAGES_MAX_SIZE)
				}
			}
			self.out.broadcast(output)
		} else {
			Err(ws::Error::new(ws::ErrorKind::Internal, ""))
		}
    }

    fn on_request(&mut self, req: &Request) -> Result<Response> {
		let path_components: std::vec::Vec<&str> = req.resource().split('?').collect();
        match path_components[0] {
            "/ws" => Response::from_request(req),
			"/test-make-auth-token" => {
				let mut c = Credentials{
					timestamp: std::time::SystemTime::now().duration_since(std::time::SystemTime::UNIX_EPOCH).unwrap().as_secs(),
					username: String::from("Anonymous"),
					signature: String::from(""),
				};
				c.signature = c.make_signature();
				let output = serde_json::to_string(&c).unwrap();
				let output = base64::encode_config(output.into_bytes(), base64::URL_SAFE_NO_PAD);
				Ok(Response::new(200, "OK", output.into_bytes()))
			},
            // "/" => Ok(Response::new(200, "OK", HTML.to_vec())),
            _ => Ok(Response::new(404, "Not Found", b"404 - Not Found".to_vec())),
        }
    }

	fn upgrade_ssl_server(&mut self, sock: TcpStream) -> ws::Result<SslStream<TcpStream>> {
		println!("upgrading...");
		let a = self.tls_acceptor.as_ref().accept(sock);
		match a {
			Ok(stream) => {
				println!("TLS stream created successfully");
				Ok(stream)
			}
			Err(_) => {
				println!("error failed");
				println!("{:#?}", a);
				Err(ws::Error::new(ws::ErrorKind::Internal, ""))
			}
		}
	}
}

fn read_file(path: &str) -> std::io::Result<std::vec::Vec<u8>> {
	use std::io::Read;
	let mut file = std::fs::File::open(path)?;
	let mut buf = std::vec::Vec::new();
	file.read_to_end(&mut buf)?;
	Ok(buf)
}

fn main() {
	env_logger::init();
	// set up TLS
	let tls_cert_path = std::env::var("TROLLBOX_TLS_CERT_PATH").expect("Process must have TROLLBOX_TLS_CERT_PATH in its environment");
	let tls_privkey_path = std::env::var("TROLLBOX_TLS_PRIVKEY_PATH").expect("Process must have TROLLBOX_TLS_PRIVKEY_PATH in its environment");
	let tls_cert = {
		let data = read_file(&tls_cert_path).unwrap();
		X509::from_pem(data.as_ref()).unwrap()
	};
	let tls_privkey = {
		let data = read_file(&tls_privkey_path).unwrap();
		PKey::private_key_from_pem(data.as_ref()).unwrap()
	};
	let tls_acceptor = std::rc::Rc::new({
		let mut builder = SslAcceptor::mozilla_intermediate_v5(SslMethod::tls()).unwrap();
		builder.set_private_key(&tls_privkey).unwrap();
		builder.set_certificate(&tls_cert).unwrap();
		builder.build()
	});
	let past_messages: Arc<Mutex<VecDeque<OutputChatMessage>>> = Arc::new(Mutex::new(VecDeque::with_capacity(PAST_MESSAGES_MAX_SIZE)));
	ws::Builder::new().with_settings(ws::Settings {
		encrypt_server: true,
		..ws::Settings::default()
	}).build(|out: ws::Sender| Server {
		out: out,
		tls_acceptor: tls_acceptor.clone(),
		credentials: None,
		past_messages: past_messages.clone(),
	}).unwrap().listen("0.0.0.0:50888").unwrap();
}
