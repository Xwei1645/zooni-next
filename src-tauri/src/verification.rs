use std::fmt;

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use tauri::AppHandle;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VerifyError {
    MissingPublicKey,
    Signature(String),
}

impl fmt::Display for VerifyError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingPublicKey => formatter.write_str("更新公钥配置缺失"),
            Self::Signature(error) => write!(formatter, "签名校验失败：{error}"),
        }
    }
}

pub fn updater_pubkey(app: &AppHandle) -> Result<String, VerifyError> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
        .ok_or(VerifyError::MissingPublicKey)
}

pub fn verify_package(bytes: &[u8], signature: &str, pubkey: &str) -> Result<(), VerifyError> {
    let pubkey_decoded = base64::engine::general_purpose::STANDARD
        .decode(pubkey)
        .map_err(|error| VerifyError::Signature(error.to_string()))?;
    let public_key = String::from_utf8(pubkey_decoded)
        .map_err(|error| VerifyError::Signature(error.to_string()))?;
    let public_key = PublicKey::decode(&public_key)
        .map_err(|error| VerifyError::Signature(error.to_string()))?;

    let signature_decoded = base64::engine::general_purpose::STANDARD
        .decode(signature)
        .map_err(|error| VerifyError::Signature(error.to_string()))?;
    let signature = String::from_utf8(signature_decoded)
        .map_err(|error| VerifyError::Signature(error.to_string()))?;
    let signature =
        Signature::decode(&signature).map_err(|error| VerifyError::Signature(error.to_string()))?;

    public_key
        .verify(bytes, &signature, true)
        .map_err(|error| VerifyError::Signature(error.to_string()))
}
