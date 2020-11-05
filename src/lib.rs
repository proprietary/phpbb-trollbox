pub mod trollbox {
    pub mod auth {
        use serde::{Deserialize, Serialize};
        use sha2::{Digest, Sha256};
        use std::fmt::Write;

        #[derive(Serialize, Deserialize, Debug)]
        pub struct Credentials {
            pub timestamp: u64,
            pub username: String,
            pub signature: String,
        }

        /// Time window in seconds before credentials become invalid.
        const EXPIRY: u64 = 3600 * 6;

        impl Credentials {
            pub fn check(&self) -> bool {
                // Check that these credentials are still valid
                let current_timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();
                if (current_timestamp - self.timestamp) > EXPIRY {
                    return false;
                }
                // Check signature
                let computed_signature = self.make_signature();
                return self.signature.eq(&computed_signature);
            }

            pub fn make_signature(&self) -> String {
                let trollbox_secret = std::env::var("TROLLBOX_SECRET")
                    .expect("Process must have TROLLBOX_SECRET environment variable set");
                let mut input: String = self.timestamp.to_string();
                input.push_str(".");
                input.push_str(&self.username);
                input.push_str(&trollbox_secret);
                let mut hasher = Sha256::new();
                hasher.update(&input.into_bytes());
                let result = hasher.finalize();
                let mut result_string = String::new();
                // Convert output digest to lowercase hex string
                for b in result {
                    write!(&mut result_string, "{:x}", b).unwrap();
                }
                return String::from(result_string);
            }
        }

        #[test]
        fn expired_credentials_fail() {
            let current_timestamp = std::time::SystemTime::now()
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let creds = Credentials {
                timestamp: current_timestamp - 3601,
                username: String::from("alice"),
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
            let mut creds = Credentials {
                timestamp: current_timestamp,
                username: String::from("alice"),
                signature: String::from(""),
            };
            creds.signature = creds.make_signature();
			println!("{}", serde_json::to_string(&creds).unwrap());
            assert_eq!(true, creds.check());
        }
    }

    pub mod msg {
        use serde::{Deserialize, Serialize};

        #[derive(Serialize, Deserialize, Debug)]
        pub struct OutputChatMessage {
			pub author: String,
            pub text: String,
            pub timestamp: u64,
        }

		#[derive(Serialize, Deserialize, Debug)]
		pub struct InputChatMessage {
			pub text: String,
			pub timestamp: u64,
		}
    }
}
