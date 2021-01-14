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
