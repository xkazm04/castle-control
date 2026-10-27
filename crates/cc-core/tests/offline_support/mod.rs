//! Read-only OS socket inventory for the dedicated offline acceptance process.
#[cfg(windows)]
pub fn assert_no_sockets() {
    use std::ffi::c_void;
    type Table = unsafe extern "system" fn(*mut c_void, *mut u32, i32, u32, i32, u32) -> u32;
    #[link(name = "iphlpapi")]
    unsafe extern "system" {
        fn GetExtendedTcpTable(
            table: *mut c_void,
            size: *mut u32,
            order: i32,
            family: u32,
            class: i32,
            reserved: u32,
        ) -> u32;
        fn GetExtendedUdpTable(
            table: *mut c_void,
            size: *mut u32,
            order: i32,
            family: u32,
            class: i32,
            reserved: u32,
        ) -> u32;
    }
    for (query, family, class, row_words) in [
        (GetExtendedTcpTable as Table, 2, 5, 6),
        (GetExtendedTcpTable as Table, 23, 5, 14),
        (GetExtendedUdpTable as Table, 2, 1, 3),
        (GetExtendedUdpTable as Table, 23, 1, 7),
    ] {
        let mut size = 0;
        // SAFETY: documented size probe; no data pointer is dereferenced.
        let status = unsafe { query(std::ptr::null_mut(), &mut size, 0, family, class, 0) };
        assert!(
            [0, 122].contains(&status),
            "socket inventory size probe failed: {status}"
        );
        // DWORD-aligned allocation, including slack for endpoints created by other processes.
        let mut buffer = vec![0u32; size as usize / 4 + 4096];
        size = (buffer.len() * 4).try_into().unwrap();
        // SAFETY: buffer is aligned, writable and at least size bytes long.
        assert_eq!(
            unsafe { query(buffer.as_mut_ptr().cast(), &mut size, 0, family, class, 0) },
            0
        );
        for row in 0..buffer[0] as usize {
            let owner = buffer[1 + row * row_words + row_words - 1];
            assert_ne!(
                owner,
                std::process::id(),
                "offline registration opened a socket"
            );
        }
    }
}

#[cfg(target_os = "linux")]
pub fn assert_no_sockets() {
    for entry in std::fs::read_dir("/proc/self/fd").unwrap() {
        let path = entry.unwrap().path();
        if let Ok(target) = std::fs::read_link(path) {
            assert!(
                !target.to_string_lossy().starts_with("socket:"),
                "offline registration opened a socket"
            );
        }
    }
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn assert_no_sockets() {
    // BSD/macOS: lsof is read-only and observes only this test process.
    let output = std::process::Command::new("lsof")
        .args(["-a", "-p", &std::process::id().to_string(), "-i", "-Fn"])
        .output()
        .unwrap();
    assert!(
        output.stdout.is_empty(),
        "offline registration opened a socket"
    );
    assert_eq!(output.status.code(), Some(1)); // no matching descriptors
}
