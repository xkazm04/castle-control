//! Revocation erase outcome: every purge step runs, then failures are reported
//! together by step name only (never viewer, chat or credential content).
use cc_types::ErrorEnvelope;

pub(super) fn collect(
    steps: Vec<(&'static str, Result<(), ErrorEnvelope>)>,
) -> Result<(), ErrorEnvelope> {
    let mut code = None;
    let mut failed = Vec::new();
    for (name, result) in steps {
        if let Err(error) = result {
            code.get_or_insert(error.code);
            failed.push(name);
        }
    }
    match code {
        None => Ok(()),
        Some(code) => Err(ErrorEnvelope::new(
            code,
            format!("live erase incomplete: {}", failed.join(", ")),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::collect;
    use cc_types::{ErrorCode, ErrorEnvelope};
    use std::cell::RefCell;

    fn step(
        ran: &RefCell<Vec<&'static str>>,
        name: &'static str,
        fail: bool,
    ) -> (&'static str, Result<(), ErrorEnvelope>) {
        ran.borrow_mut().push(name);
        let result = if fail {
            Err(ErrorEnvelope::new(
                ErrorCode::Internal,
                "simulated failure text",
            ))
        } else {
            Ok(())
        };
        (name, result)
    }

    #[test]
    fn early_failure_does_not_skip_later_steps_and_names_failed_steps() {
        let ran = RefCell::new(Vec::new());
        let error = collect(vec![
            step(&ran, "gatehouse", true),
            step(&ran, "lots", false),
            step(&ran, "beacons", true),
        ])
        .unwrap_err();
        assert_eq!(*ran.borrow(), ["gatehouse", "lots", "beacons"]);
        assert_eq!(error.code, ErrorCode::Internal);
        assert_eq!(error.message, "live erase incomplete: gatehouse, beacons");
    }

    #[test]
    fn all_success_is_ok() {
        let ran = RefCell::new(Vec::new());
        assert!(collect(vec![step(&ran, "gatehouse", false)]).is_ok());
    }
}
