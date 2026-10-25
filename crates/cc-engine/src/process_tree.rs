//! Windows process-tree custody; job names, not recycled PIDs, identify orphans.
use crate::{Failure, Result};

#[cfg(windows)]
mod platform {
    use super::*;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            OpenJobObjectW, SetInformationJobObject, TerminateJobObject,
        },
    };
    pub struct Tree(HANDLE);
    // The handle is owned exclusively by Tree; Win32 job operations are thread-safe.
    unsafe impl Send for Tree {}
    impl Tree {
        pub fn new(id: &str) -> Result<Self> {
            let name = name(id);
            // SAFETY: NUL-terminated name and null security attributes; handle is owned.
            let handle = unsafe { CreateJobObjectW(std::ptr::null(), name.as_ptr()) };
            if handle.is_null() {
                return Err(Failure::Supervision);
            }
            let tree = Self(handle);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: info matches the class and remains live throughout the call.
            let ok = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as _,
                    std::mem::size_of_val(&info) as u32,
                )
            };
            if ok == 0 {
                return Err(Failure::Supervision);
            }
            Ok(tree)
        }
        pub fn attach(&self, child: &tokio::process::Child) -> Result<()> {
            let handle = child.raw_handle().ok_or(Failure::Supervision)?;
            // SAFETY: both handles are live, and the child is assigned before sending input.
            if unsafe { AssignProcessToJobObject(self.0, handle as _) } == 0 {
                return Err(Failure::Supervision);
            }
            Ok(())
        }
        pub fn terminate(&self) -> Result<()> {
            // SAFETY: self owns a live job handle.
            if unsafe { TerminateJobObject(self.0, 1) } == 0 {
                return Err(Failure::Supervision);
            }
            Ok(())
        }
    }
    impl Drop for Tree {
        fn drop(&mut self) {
            // SAFETY: exactly one owner closes the non-inheritable handle; kill-on-close
            // also retires descendants after a nominally successful parent exit.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    fn name(id: &str) -> Vec<u16> {
        format!("Local\\CastleControlEngine-{id}\0")
            .encode_utf16()
            .collect()
    }
    pub fn sweep(id: &str) -> Result<()> {
        let name = name(id);
        // JOB_OBJECT_TERMINATE = 0x0008. No PID lookup or name-based process killing.
        let handle = unsafe { OpenJobObjectW(0x0008, 0, name.as_ptr()) };
        if handle.is_null() {
            let code = unsafe { windows_sys::Win32::Foundation::GetLastError() };
            return if code == 2 {
                Ok(())
            } else {
                Err(Failure::Supervision)
            };
        }
        let job = Tree(handle);
        job.terminate()
    }
}
#[cfg(not(windows))]
mod platform {
    use super::*;
    // M6 owns non-Windows CLI containment. Refuse rather than silently drop custody.
    pub struct Tree;
    impl Tree {
        pub fn new(_: &str) -> Result<Self> {
            Err(Failure::Supervision)
        }
        pub fn attach(&self, _: &tokio::process::Child) -> Result<()> {
            Err(Failure::Supervision)
        }
        pub fn terminate(&self) -> Result<()> {
            Err(Failure::Supervision)
        }
    }
    pub fn sweep(_: &str) -> Result<()> {
        Err(Failure::Supervision)
    }
}
pub(crate) use platform::{Tree, sweep};
