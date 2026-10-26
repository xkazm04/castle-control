//! Pure local text features; no moderation, transport or action dependencies.
use crate::herald::{DirectionSeed, LocalEmbedding};
use std::collections::BTreeMap;

pub(crate) fn words(text: &str) -> Vec<String> {
    text.split(|c: char| !c.is_alphanumeric() && c != '_')
        .filter(|w| !w.is_empty())
        .map(str::to_lowercase)
        .collect()
}

/// Stable hashed bag of words. It measures lexical similarity, not semantics.
#[derive(Default)]
pub struct HashedWords;
impl LocalEmbedding for HashedWords {
    fn embed(&self, text: &str) -> Vec<f64> {
        let mut result = vec![0.0; 256];
        for word in words(text) {
            let hash = word.bytes().fold(0x811c9dc5_u32, |h, b| {
                (h ^ u32::from(b)).wrapping_mul(0x01000193)
            });
            result[(hash % 256) as usize] += 1.0;
        }
        result
    }
}

#[derive(Clone)]
pub(crate) struct Features {
    pub text: bool,
    pub emotes: BTreeMap<String, usize>,
    pub all_key: usize,
    pub text_key: usize,
    pub emotes_key: usize,
}

pub(crate) fn classify(
    text: &str,
    seeds: &[DirectionSeed],
    embedding: &dyn LocalEmbedding,
) -> usize {
    let v = embedding.embed(text);
    let mut best = (0.0, seeds.len());
    let norm = v.iter().map(|x| x * x).sum::<f64>().sqrt();
    if !norm.is_finite() || norm == 0.0 {
        return best.1;
    }
    for (i, seed) in seeds.iter().enumerate() {
        let other = embedding.embed(&seed.keywords.join(" "));
        let denom = norm * other.iter().map(|x| x * x).sum::<f64>().sqrt();
        if other.len() != v.len() || !denom.is_finite() || denom == 0.0 {
            continue;
        }
        let score = v.iter().zip(other).map(|(a, b)| a * b).sum::<f64>() / denom;
        if score > best.0 {
            best = (score, i);
        }
    }
    best.1
}

pub(crate) fn features(
    text: &str,
    seeds: &[DirectionSeed],
    lexicon: &BTreeMap<String, String>,
    embedding: &dyn LocalEmbedding,
) -> Features {
    let mut plain = Vec::new();
    let mut meanings = Vec::new();
    let mut emotes = BTreeMap::new();
    for token in text.split_whitespace() {
        let token = token.to_lowercase();
        let word = if lexicon.contains_key(&token) {
            token.clone()
        } else {
            words(&token).join(" ")
        };
        if let Some(meaning) = lexicon.get(&word) {
            meanings.push(meaning.clone());
            emotes.insert(word, classify(meaning, seeds, embedding));
        } else {
            plain.extend(words(&token));
        }
    }
    let text = !plain.is_empty();
    let text_key = classify(&plain.join(" "), seeds, embedding);
    let emotes_key = classify(&meanings.join(" "), seeds, embedding);
    plain.extend(meanings);
    Features {
        text,
        emotes,
        all_key: classify(&plain.join(" "), seeds, embedding),
        text_key,
        emotes_key,
    }
}
