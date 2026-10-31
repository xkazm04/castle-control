//! Read-only shell and escaped fallback for the cast-only renderer host.
use super::lots::{AcceptedDraw, DisplayParams};
use cc_types::{DrawContent, LotsRandomnessPlan};
use serde::Serialize;

// The OBS fallback is a plate, not an interactive scroll surface. The complete
// immutable cast remains in cc-cast for validators and the renderer.
const WINNER_PLATE_CAP: usize = 8;

/// Waiting pages discover a seal/cast quickly. Completed pages still reload so
/// revocation/purge clears the result, without interrupting a large winner reveal.
fn refresh_seconds(scene: Option<&AcceptedDraw>, timing_ms: u32) -> usize {
    scene
        .and_then(|scene| scene.cast.as_ref())
        .map_or(1, |cast| {
            60.max(3 + cast.cast.winners.len() + timing_ms.div_ceil(1000) as usize)
        })
}

fn island(id: &str, value: &impl Serialize) -> Result<String, serde_json::Error> {
    // Script raw-text parsing ignores HTML entities: escape '<' in JSON instead.
    let json = serde_json::to_string(value)?.replace('<', "\\u003c");
    Ok(format!(
        "<script type=\"application/json\" id=\"{id}\">{json}</script>"
    ))
}

pub(super) fn render(
    scene: Option<&AcceptedDraw>,
    display: &DisplayParams,
) -> Result<String, serde_json::Error> {
    let mut islands = String::new();
    let (body, content, simulated) = if let Some(scene) = scene {
        islands.push_str(&island("cc-seal", &scene.seal)?);
        if let Some(cast) = &scene.cast {
            islands.push_str(&island("cc-cast", cast)?);
        }
        let content = match scene.content {
            DrawContent::Prize => "prize",
            DrawContent::Question => "question",
            DrawContent::Idea => "idea",
            DrawContent::Seat => "seat",
        };
        (fallback(scene), content, scene.simulated)
    } else {
        (
            "<h1>Lot Chamber</h1><p>Waiting for an accepted seal. No draw result.</p>".into(),
            "question",
            false,
        )
    };
    // Deliberately replace the former no-JSON-in-OBS approach: the existing
    // contract validators admit these two values, with no new event schema.
    Ok(format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta http-equiv=\"refresh\" content=\"{}\"><title>Castle Control draw</title><style>{}\n{}</style></head><body><main id=\"draw\" data-content=\"{content}\" data-simulated=\"{simulated}\" data-anchor=\"{}\" data-colour=\"{}\" style=\"--draw-scale:{};--draw-reveal:{}ms\"><section data-draw-fallback>{body}</section>{islands}</main><script type=\"module\" src=\"/bundle.js\"></script></body></html>",
        refresh_seconds(scene, display.timing_ms),
        include_str!("../../../../packages/tokens/src/generated.css"),
        include_str!("lots.css"),
        display.anchor,
        display.colour,
        display.scale,
        display.timing_ms,
    ))
}

fn fallback(scene: &AcceptedDraw) -> String {
    let seal = &scene.seal.sealed;
    let source = match &seal.roll.randomness {
        LotsRandomnessPlan::Drand { round, .. } => format!(
            "{} · Target round · {}",
            if scene.simulated {
                "Simulated · recorded transport"
            } else {
                "Live-trusted quicknet"
            },
            String::from(round.clone())
        ),
        LotsRandomnessPlan::Streamer { .. } => format!(
            "{}Streamer-controlled commit/reveal",
            if scene.simulated { "Simulated · " } else { "" }
        ),
    };
    let winners = scene
        .cast
        .as_ref()
        .map(|cast| {
            let entries = cast
                .cast
                .winners
                .iter()
                .take(WINNER_PLATE_CAP)
                .map(|winner| format!("<li>{}</li>", escape(&String::from(winner.clone()))))
                .collect::<String>();
            let remaining = cast.cast.winners.len().saturating_sub(WINNER_PLATE_CAP);
            let more = if remaining > 0 {
                format!(
                    "<p class=\"draw-more\">{}</p>",
                    escape(&format!("+{remaining} more"))
                )
            } else {
                String::new()
            };
            format!("<h2>Winners</h2><ol>{entries}</ol>{more}")
        })
        .unwrap_or_else(|| "<p>Waiting for the announced round and verified cast.</p>".into());
    let disclaimer = if scene.content == DrawContent::Prize {
        "<footer>Twitch does not sponsor this promotion</footer>"
    } else {
        ""
    };
    format!(
        "<h1>Lot Chamber · draw on stream</h1>{}<p>{}</p><h2>Seal announced</h2><p class=\"seal\">{}</p><p>Sealed at · {}</p><p>{} frozen entries</p>{winners}{disclaimer}",
        if scene.simulated {
            "<p class=\"simulated\">SIMULATED</p>"
        } else {
            ""
        },
        escape(&source),
        String::from(seal.seal.clone()),
        String::from(seal.roll.sealed_at.clone()),
        seal.roll.entries.len(),
    )
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    #[test]
    fn fallback_text_escapes_markup_and_quotes() {
        assert_eq!(
            super::escape("<simulated>&\"'"),
            "&lt;simulated&gt;&amp;&quot;&#39;"
        );
    }

    #[test]
    fn island_escapes_raw_text_end_tags_without_changing_the_value() {
        let winner = "simulated</script><script>alert(1)</script>";
        let island = super::island("cc-cast", &winner).unwrap();
        assert_eq!(island.matches("</script>").count(), 1);
        let json = island
            .split_once('>')
            .unwrap()
            .1
            .strip_suffix("</script>")
            .unwrap();
        assert_eq!(serde_json::from_str::<String>(json).unwrap(), winner);
    }
}
