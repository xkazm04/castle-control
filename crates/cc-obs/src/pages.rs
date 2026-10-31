//! The overlay page grammar, shared by routing, ownership and CreateInput.
//! Resource endpoints (bundle, assets, push) are never OBS page capabilities.
pub const SPIKE_ROUTE: &str = "/";
pub const BEACONS_ROUTE: &str = "/beacons/{visual_id}";
pub const LOTS_ROUTE: &str = "/lots/{draw_id}";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayPage<'a> {
    Spike,
    Beacons {
        visual: &'a str,
        package_hash: Option<&'a str>,
    },
    Lots {
        draw: &'a str,
    },
}

impl OverlayPage<'_> {
    /// Canonical identity; presentation keys carry no authority and are omitted.
    /// CreateInput still forwards the original, validated URL verbatim.
    pub fn path_and_query(&self) -> String {
        match self {
            Self::Spike => SPIKE_ROUTE.to_owned(),
            Self::Beacons {
                visual,
                package_hash,
            } => {
                let mut path = format!("/beacons/{visual}");
                if let Some(hash) = package_hash {
                    path.push_str("?package_hash=");
                    path.push_str(hash);
                }
                path
            }
            Self::Lots { draw } => format!("/lots/{draw}"),
        }
    }
}

/// Keep raw keys exact, as in the L5 guard: no decoding, duplicate identity,
/// unknown key or empty query segment. Scale/anchor values are presentation-only
/// and may be empty, repeated or invalid; each renderer owns their defaults.
pub fn parse<'a>(path: &'a str, query: Option<&'a str>) -> Option<OverlayPage<'a>> {
    if path == SPIKE_ROUTE {
        return query.is_none().then_some(OverlayPage::Spike);
    }
    let (beacons, id) = if let Some(id) = path.strip_prefix("/beacons/") {
        (true, id)
    } else {
        (false, path.strip_prefix("/lots/")?)
    };
    if !id.split('-').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    }) {
        return None;
    }
    let mut package_hash = None;
    if let Some(query) = query {
        for part in query.split('&') {
            if matches!(part.split('=').next(), Some("scale" | "anchor")) {
                continue;
            }
            if !beacons || package_hash.is_some() {
                return None;
            }
            let hash = part.strip_prefix("package_hash=")?;
            if hash.len() != 64
                || !hash
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            {
                return None;
            }
            package_hash = Some(hash);
        }
    }
    Some(if beacons {
        OverlayPage::Beacons {
            visual: id,
            package_hash,
        }
    } else {
        OverlayPage::Lots { draw: id }
    })
}
