#[macro_use]
extern crate log;

pub mod trollbox {
    pub mod auth {
        use serde::{Deserialize, Serialize};
        use sha2::{Digest, Sha256};
        use std::fmt::Write;

        #[derive(Serialize, Deserialize, Debug)]
        pub struct Credentials {
            pub timestamp: u64,
            pub username: String,
            pub uid: u32,
            pub role: String,
        }

        #[derive(Serialize, Deserialize, Debug)]
        pub struct SignedCredentials {
            pub credentials: Credentials,
            pub signature: String,
        }

        /// Time window in seconds before credentials become invalid.
        const EXPIRY: u64 = 3600 * 6;

        impl SignedCredentials {
            pub fn check(&self) -> bool {
                // Check that these credentials are still valid
                let current_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                if (current_timestamp - self.credentials.timestamp) > EXPIRY {
                    return false;
                }
                // Check signature
                let computed_signature = self.make_signature();
                debug!(
                    "computed_signature = {}, signature = {}",
                    computed_signature, self.signature
                );
                return self.signature == computed_signature;
            }

            pub fn make_signature(&self) -> String {
                let trollbox_secret = std::env::var("TROLLBOX_SECRET")
                    .expect("Process must have TROLLBOX_SECRET environment variable set");
                let credentials_text = serde_json::to_string(&self.credentials).unwrap();
                let mut hasher = Sha256::new();
                hasher.update(&credentials_text.into_bytes());
                hasher.update(&trollbox_secret.into_bytes());
                let result = hasher.finalize();
                let mut result_string = String::new();
                // Convert output digest to lowercase hex string
                for b in result {
                    write!(&mut result_string, "{:02x}", b).unwrap();
                }
                return result_string;
            }
        }

        pub fn from_b64(input: &[u8]) -> Option<SignedCredentials> {
            let creds_json_bytes = match base64::decode_config(input, base64::URL_SAFE_NO_PAD) {
                Ok(b) => b,
                Err(e) => {
                    debug!("{}", e);
                    return None;
                }
            };
            let creds_json_as_str = match std::str::from_utf8(&creds_json_bytes) {
                Ok(s) => s,
                Err(e) => {
                    debug!("{}", e);
                    return None;
                }
            };
            let creds: SignedCredentials = match serde_json::from_str(creds_json_as_str) {
                Ok(c) => c,
                Err(e) => {
                    debug!("{}", e);
                    return None;
                }
            };
            Some(creds)
        }

        #[test]
        fn expired_credentials_fail() {
            let current_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let creds = SignedCredentials {
                credentials: Credentials {
                    timestamp: current_timestamp - 3601,
                    username: String::from("alice"),
                    uid: 0,
                    role: String::from("user"),
                },
                signature: String::from(""),
            };
            assert_eq!(false, creds.check());
        }

        #[test]
        fn credentials_verify() {
            let current_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let mut creds = SignedCredentials {
                credentials: Credentials {
                    timestamp: current_timestamp,
                    username: String::from("alice"),
                    uid: 0,
                    role: String::from("user"),
                },
                signature: String::from(""),
            };
            creds.signature = creds.make_signature();
            println!("{}", serde_json::to_string(&creds).unwrap());
            assert_eq!(true, creds.check());
        }

        #[test]
        fn credentials_verify_generated_unicode_username() {
            let current_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let mut creds = SignedCredentials {
                credentials: Credentials {
                    timestamp: current_timestamp,
                    username: String::from("K\u{00f6}nchok Ch\u{00f6}drak"),
                    uid: 0,
                    role: String::from("user"),
                },
                signature: String::from(""),
            };
            creds.signature = creds.make_signature();
            println!("{}", serde_json::to_string(&creds).unwrap());
            assert_eq!(true, creds.check());
        }

        #[test]
        fn verify_unicode_escaped_username() {
            let input = "eyJzaWduYXR1cmUiOiJkODBjZDdiYmJlODNiZmI5NDRmMDllZGY3OTA5ODExMDM1Nzc0ZTZlNTY3ODhmNjdiNjhjZTA0ZjkxNWZjZDI1IiwiY3JlZGVudGlhbHMiOnsidGltZXN0YW1wIjoxNjEzMTcwOTQ3LCJ1c2VybmFtZSI6IkvDtm5jaG9rIENow7ZkcmFrMSIsInVpZCI6MTMzODgsInJvbGUiOiJ1c2VyIn19".to_string();
            let creds_json_bytes = base64::decode_config(input, base64::URL_SAFE_NO_PAD).unwrap();
            let creds_json_as_str = std::str::from_utf8(&creds_json_bytes).unwrap();
            assert_eq!("{\"signature\":\"d80cd7bbbe83bfb944f09edf7909811035774e6e56788f67b68ce04f915fcd25\",\"credentials\":{\"timestamp\":1613170947,\"username\":\"K\u{00f6}nchok Ch\u{00f6}drak1\",\"uid\":13388,\"role\":\"user\"}}".to_string(),
					   creds_json_as_str);
            println!("{}", creds_json_as_str);
            let creds: Result<SignedCredentials, serde_json::error::Error> =
                serde_json::from_str(creds_json_as_str);
            assert_eq!(true, creds.unwrap().check());
        }

        #[test]
        fn deserialize_base64_encoded_credentials() {
            let input = "eyJzaWduYXR1cmUiOiJkODBjZDdiYmJlODNiZmI5NDRmMDllZGY3OTA5ODExMDM1Nzc0ZTZlNTY3ODhmNjdiNjhjZTA0ZjkxNWZjZDI1IiwiY3JlZGVudGlhbHMiOnsidGltZXN0YW1wIjoxNjEzMTcwOTQ3LCJ1c2VybmFtZSI6IkvDtm5jaG9rIENow7ZkcmFrMSIsInVpZCI6MTMzODgsInJvbGUiOiJ1c2VyIn19".as_bytes();
            let sc = from_b64(&input).unwrap();
            assert_eq!(true, sc.check());
        }
    }

    pub mod msg {
        use serde::{Deserialize, Serialize};

        #[derive(Serialize, Deserialize, Debug, Clone)]
        pub struct ChatMessage {
            pub id: String,
            pub author_name: String,
            pub author_uid: u32,
            pub author_role: String,
            pub text: String,
            pub timestamp: u64,
        }

        #[derive(Serialize, Deserialize, Debug)]
        pub enum ChatActionType {
            PostMessage = 0isize,
            DeleteMessage = 1isize,
        }

        #[derive(Serialize, Deserialize, Debug)]
        pub struct ChatAction {
            pub action: ChatActionType,
            pub message: ChatMessage,
        }
    }
}
