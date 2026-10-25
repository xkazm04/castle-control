/// Rust-only response validation policy. The caller's existing parser owns a
/// custom shape; this does not add a wire schema or bypass measured admission.
#[derive(Clone, Copy)]
pub enum AnswerShape<'a> {
    Verdict,
    /// Custom shapes may include JSON arrays. Do not force the endpoint's
    /// `json_object` mode on them; the supplied parser must reject invalid text.
    Custom(&'a (dyn Fn(&str) -> bool + Sync)),
}

impl AnswerShape<'_> {
    pub(crate) fn accepts(self, text: &str) -> bool {
        match self {
            Self::Verdict => crate::floor::verdict(text).is_ok(),
            Self::Custom(validate) => validate(text),
        }
    }
}
