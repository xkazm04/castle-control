use crate::{Entry, Error, hash, unhex};

pub(crate) fn entry_bytes(entries: &[Entry]) -> Vec<u8> {
    let mut out = Vec::new();
    for entry in entries {
        out.extend((entry.handle.len() as u32).to_be_bytes());
        out.extend(entry.handle.as_bytes());
        out.extend(entry.weight.to_be_bytes());
    }
    out
}

pub(crate) fn sample(candidate: u64, total: u64) -> Option<u64> {
    let limit = ((1_u128 << 64) / u128::from(total)) * u128::from(total);
    (u128::from(candidate) < limit).then_some(candidate % total)
}

pub(crate) fn cast(
    entries: &[Entry],
    count: u32,
    seal: &str,
    randomness: [u8; 32],
) -> Result<Vec<String>, Error> {
    let mut seed_bytes = b"castle-control/cast/v1\0".to_vec();
    seed_bytes.extend(randomness);
    seed_bytes.extend(unhex::<32>(seal)?);
    seed_bytes.extend(entry_bytes(entries));
    let seed = hash(seed_bytes);
    let mut pool = entries.to_vec();
    let mut winners = Vec::new();
    let mut counter = 0_u64;
    while winners.len() < count as usize {
        let total = pool.iter().map(|e| u64::from(e.weight)).sum();
        let mut input = seed.to_vec();
        input.extend(counter.to_be_bytes());
        let digest = hash(input);
        let candidate = u64::from_be_bytes(digest[..8].try_into().expect("eight digest bytes"));
        counter = counter
            .checked_add(1)
            .ok_or(Error::Invalid("cast exhausted"))?;
        let Some(mut target) = sample(candidate, total) else {
            continue;
        };
        let index = pool
            .iter()
            .position(|entry| {
                if target < u64::from(entry.weight) {
                    true
                } else {
                    target -= u64::from(entry.weight);
                    false
                }
            })
            .ok_or(Error::Invalid("cast total"))?;
        winners.push(pool.remove(index).handle);
    }
    Ok(winners)
}
