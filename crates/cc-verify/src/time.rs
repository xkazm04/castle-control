use crate::Error;

// Deliberately accepts the canonical whole-second UTC subset only.
pub(crate) fn timestamp(value: &str) -> Result<u64, Error> {
    let b = value.as_bytes();
    if b.len() != 20
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'Z'
    {
        return Err(Error::Invalid("timestamp must be YYYY-MM-DDTHH:MM:SSZ"));
    }
    let number = |start, end| -> Result<u64, Error> {
        let digits = &b[start..end];
        if !digits.iter().all(u8::is_ascii_digit) {
            return Err(Error::Invalid("timestamp digits"));
        }
        Ok(digits.iter().fold(0, |n, c| n * 10 + u64::from(c - b'0')))
    };
    let year = number(0, 4)?;
    let month = number(5, 7)?;
    let day = number(8, 10)?;
    let hour = number(11, 13)?;
    let minute = number(14, 16)?;
    let second = number(17, 19)?;
    let leap = |y: u64| y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400));
    let days = [
        31,
        if leap(year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if year < 1970
        || !(1..=12).contains(&month)
        || day == 0
        || day > days[(month - 1) as usize]
        || hour > 23
        || minute > 59
        || second > 59
    {
        return Err(Error::Invalid("timestamp range"));
    }
    let mut elapsed = 0;
    for y in 1970..year {
        elapsed += if leap(y) { 366 } else { 365 };
    }
    elapsed += days[..(month - 1) as usize].iter().sum::<u64>() + day - 1;
    Ok(elapsed * 86400 + hour * 3600 + minute * 60 + second)
}
