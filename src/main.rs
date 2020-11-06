#[macro_use] extern crate log;
extern crate env_logger;

use trollbox::trollbox::auth::Credentials;
use trollbox::trollbox::msg::{InputChatMessage, OutputChatMessage};
use ws::{Handler, Handshake, Message, Request, Response, Result, Sender, OpCode, Frame};
use mio_extras::timer::Timeout;
use ws::util::Token;
use std::sync::{Arc, Mutex};
use std::collections::VecDeque;

const PAST_MESSAGES_MAX_SIZE: usize = 100;

const PING: Token = Token(1);
const EXPIRE: Token = Token(2);

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
	credentials: Option<Credentials>,
	past_messages: Arc<Mutex<VecDeque<OutputChatMessage>>>,
	ping_timeout: Option<Timeout>,
	expire_timeout: Option<Timeout>,
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
						debug!("equals ('=') missing in query string");
						return self.out.close(ws::CloseCode::Error);
					}
				}
			}
			None => {
				debug!("query string missing");
				return self.out.close(ws::CloseCode::Error);
			}
		};
		debug!("received credentials string: {}", hdr);
		let creds: Credentials = match base64::decode_config(hdr, base64::URL_SAFE_NO_PAD) {
			Ok(creds_json) => {
				match serde_json::from_slice(&creds_json) {
					Ok(creds) => creds,
					Err(_) => {
						debug!("couldn't deserialize credentials from JSON");
						return self.out.close(ws::CloseCode::Error);
					}
				}
			}
			Err(_) => {
				debug!("couldn't deserialize credentials from url-safe base64");
				return self.out.close(ws::CloseCode::Error);
 			}
		};
		debug!("checking credentials...");
		return if creds.check() {
			// schedule pings
			self.out.timeout(10_000, PING).unwrap();
			self.out.timeout(60_000, EXPIRE).unwrap();
			// save credentials
			self.credentials = Some(creds);
			let h = self.past_messages.clone();
			let hh = h.lock().unwrap();
			debug!("successful unlock of shared past_messages");
			let mut output: std::vec::Vec<OutputChatMessage> = vec![];
			for m in hh.iter().rev() {
				output.push(OutputChatMessage{
					author: m.author.clone(),
					text: m.text.clone(),
					timestamp: m.timestamp,
				});
			}
			let output_string = serde_json::to_string(&output).unwrap();
			self.out.send(output_string)
		} else {
			debug!("invalid credentials");
			self.out.close(ws::CloseCode::Error)
		}
    }

    fn on_message(&mut self, msg: Message) -> Result<()> {
		if let Some(_) = self.credentials {
			let input_chat_message: InputChatMessage = serde_json::from_str(msg.as_text().unwrap()).unwrap();
			let output_chat_message: OutputChatMessage = OutputChatMessage{
				author: self.credentials.as_ref().unwrap().username.clone(),
				text: input_chat_message.text.clone(),
				timestamp: std::time::SystemTime::now().duration_since(std::time::SystemTime::UNIX_EPOCH).unwrap().as_secs(),
			};
			let output = serde_json::to_string(&output_chat_message).unwrap();
			{
				let v = Arc::clone(&self.past_messages);
				let mut vv = v.lock().unwrap();
				vv.push_front(output_chat_message);
				if vv.len() > PAST_MESSAGES_MAX_SIZE {
					vv.truncate(PAST_MESSAGES_MAX_SIZE);
				}
			}
			self.out.broadcast(output)
		} else {
			Err(ws::Error::new(ws::ErrorKind::Internal, ""))
		}
    }

	fn on_error(&mut self, err: ws::Error) {
		warn!("ws server error: {}", err);
	}

	fn on_timeout(&mut self, event: Token) -> Result<()> {
		match event {
			PING => {
				let t: String = std::time::SystemTime::now().duration_since(std::time::SystemTime::UNIX_EPOCH)
					.expect("System clock before 1970, wtf?")
					.as_nanos()
					.to_string();
				self.out.ping(t.into())?;
				self.ping_timeout.take();
				self.out.timeout(10_000, PING)
			},
			EXPIRE => {
				debug!("EXPIRED timeout met. Client did not pong back in time.");
				if let Some(t) = self.expire_timeout.take() {
					debug!("on_timeout(): expired timeout is {:#?}", t);
				}
				self.out.timeout(60_000, EXPIRE)
				// TODO: drop connection here?
			},
			_ => Err(ws::Error::new(ws::ErrorKind::Internal, "Unknown timeout token")),
		}
	}

	fn on_new_timeout(&mut self, event: Token, timeout: Timeout) -> Result<()> {
		// Cancel the old timeout and replace with a new one.
		match event {
			EXPIRE => {
				debug!("changing expire timeout...");
				if let Some(t) = self.expire_timeout.take() {
					self.out.cancel(t)?
				}
				self.expire_timeout = Some(timeout)
			}
			PING => {
				debug!("changing ping timeout...");
				// ensures there is only one ping timeout at any time
				if let Some(t) = self.ping_timeout.take() {
					self.out.cancel(t)?
				}
				self.ping_timeout = Some(timeout)
			}
			_ => (),
		}
		Ok(())
	}

	fn on_frame(&mut self, frame: Frame) -> Result<Option<Frame>> {
		use std::convert::TryInto;
        // If the frame is a pong, print the round-trip time.
        // The pong should contain data from out ping, but it isn't guaranteed to.
        if frame.opcode() == OpCode::Pong {
            if let Ok(pong) = std::str::from_utf8(frame.payload())?.parse::<u64>() {
				let now: u64 = std::time::SystemTime::now().duration_since(std::time::SystemTime::UNIX_EPOCH).expect("Syste clock was before 1970, wtf?").as_nanos().try_into().expect("This function will be removed long before this becomes a problem");
                debug!("RTT is {:.3}ms.", (now - pong) as f64 / 1_000_000f64);
            } else {
                warn!("Received bad pong.");
            }
        }

        // Some activity has occured, so reset the expiration
		if let Some(t) = self.expire_timeout.take() {
			debug!("expire timeout: {:#?}", t);
			self.out.cancel(t).unwrap();
		}
        self.out.timeout(60_000, EXPIRE)?;

        // Run default frame validation
        DefaultHandler.on_frame(frame)
    }

 	fn on_close(&mut self, code: ws::CloseCode, reason: &str) {
		debug!("WebSocket closing for ({:?}) {}", code, reason);
		// clean up timeouts
		if let Some(t) = self.ping_timeout.take() {
			self.out.cancel(t).unwrap();
		}
		if let Some(t) = self.expire_timeout.take() {
			self.out.cancel(t).unwrap();
		}
	}


    fn on_request(&mut self, req: &Request) -> Result<Response> {
		let path_components: std::vec::Vec<&str> = req.resource().split('?').collect();
		if path_components.len() == 0 {
			return Ok(Response::new(404, "Not Found", b"404 - Not Found".to_vec()));
		}
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
}

struct DefaultHandler;

impl Handler for DefaultHandler {}

fn main() {
	env_logger::init();
	let past_messages: Arc<Mutex<VecDeque<OutputChatMessage>>> = Arc::new(Mutex::new(VecDeque::with_capacity(PAST_MESSAGES_MAX_SIZE)));
	ws::Builder::new().with_settings(ws::Settings {
		panic_on_internal: false,
		max_connections: 65536,
		..ws::Settings::default()
	}).build(|out: ws::Sender| Server {
		out: out,
		credentials: None,
		past_messages: past_messages.clone(),
		ping_timeout: None,
		expire_timeout: None,
	}).unwrap().listen("0.0.0.0:50888").unwrap();
}
