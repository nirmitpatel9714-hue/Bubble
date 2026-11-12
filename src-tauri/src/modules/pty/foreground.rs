//! "Does the shell have child processes?" without forking `pgrep`.
//!
//! The close-tab guard asks this on the main thread, so it must be a cheap
//! kernel query: `proc_listchildpids` on macOS, `/proc/<pid>/task/*/children`
//! on Linux (with a `/proc/*/stat` parent scan for kernels built without
//! `CONFIG_PROC_CHILDREN`), and the existing ToolHelp snapshot on Windows.

#[cfg(target_os = "macos")]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    // One slot is enough: only existence matters, and the kernel fills what
    // fits and reports the count it wrote.
    let mut child: libc::pid_t = 0;
    let listed = unsafe {
        libc::proc_listchildpids(
            shell_pid as libc::pid_t,
            (&mut child as *mut libc::pid_t).cast(),
            std::mem::size_of::<libc::pid_t>() as libc::c_int,
        )
    };
    listed > 0
}

#[cfg(target_os = "linux")]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    use std::fs;
    let tasks = format!("/proc/{shell_pid}/task");
    let mut readable = false;
    if let Ok(entries) = fs::read_dir(&tasks) {
        for task in entries.flatten() {
            match fs::read_to_string(task.path().join("children")) {
                Ok(children) => {
                    readable = true;
                    if children_listed(&children) {
                        return true;
                    }
                }
                Err(_) => continue,
            }
        }
    }
    if readable {
        return false;
    }
    // No `children` files (CONFIG_PROC_CHILDREN is off): scan parents.
    fs::read_dir("/proc").is_ok_and(|entries| {
        entries.flatten().any(|entry| {
            entry.file_name().to_str().is_some_and(|name| {
                name.bytes().all(|b| b.is_ascii_digit())
                    && fs::read_to_string(entry.path().join("stat"))
                        .ok()
                        .and_then(|stat| stat_parent(&stat))
                        == Some(shell_pid)
            })
        })
    })
}

/// A `children` file lists space-separated pids; empty means none.
#[cfg(any(target_os = "linux", test))]
fn children_listed(contents: &str) -> bool {
    contents.split_whitespace().next().is_some()
}

/// Parent pid from `/proc/<pid>/stat`: `pid (comm) state ppid ...` where
/// `comm` may itself contain spaces and parentheses, so anchor on the last `)`.
#[cfg(any(target_os = "linux", test))]
fn stat_parent(stat: &str) -> Option<u32> {
    let after = &stat[stat.rfind(')')? + 1..];
    after.split_whitespace().nth(1)?.parse().ok()
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    // pgrep -P exits 0 when shell_pid has at least one child, 1 when none.
    std::process::Command::new("pgrep")
        .args(["-P", &shell_pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(windows)]
pub(super) fn shell_has_children(shell_pid: u32) -> bool {
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32First, Process32Next, PROCESSENTRY32, TH32CS_SNAPPROCESS,
    };
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut entry: PROCESSENTRY32 = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32>() as u32;
        let mut found = false;
        if Process32First(snapshot, &mut entry) != 0 {
            loop {
                if entry.th32ParentProcessID == shell_pid {
                    found = true;
                    break;
                }
                if Process32Next(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        found
    }
}

/// A descendant of a shell process with its executable name, for hookless
/// agent detection: the scanner matches names against known agent commands.
pub(super) struct ChildProcess {
    pub pid: u32,
    /// Executable base name, e.g. `claude` from `/usr/local/bin/claude` or
    /// `codex.exe` from `codex.exe`. Empty when the platform could not tell.
    pub name: String,
}

/// Depth and size caps keep a process-spawning loop from spinning forever and
/// bound the cost of a scan that runs every couple of seconds.
const MAX_DEPTH: usize = 6;
const MAX_PROCESSES: usize = 96;

/// Executables that spawn agents (or everything else) but are never agents
/// themselves are skipped on the frontend matcher side — a custom agent whose
/// command starts with one of those (`npm run agent`) cannot be identified
/// from the process name alone; OSC command-line matching and hooks cover
/// those launches instead.

/// Base name of an executable path or bare command, keeping its case so the
/// Windows snapshot (which is already the real file name) compares cleanly.
pub(super) fn executable_name(path: &str) -> String {
    let trimmed = path.trim();
    let base = trimmed
        .rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(trimmed);
    base.to_string()
}

#[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux", test))]
fn walk_descendants(
    root: u32,
    by_parent: &std::collections::HashMap<u32, Vec<(u32, String)>>,
) -> Vec<ChildProcess> {
    use std::collections::VecDeque;
    let mut out = Vec::new();
    let mut queue = VecDeque::from([(root, 0usize)]);
    while let Some((pid, depth)) = queue.pop_front() {
        if depth >= MAX_DEPTH || out.len() >= MAX_PROCESSES {
            continue;
        }
        let children = by_parent.get(&pid).map(Vec::as_slice).unwrap_or(&[]);
        for (child_pid, name) in children {
            out.push(ChildProcess {
                pid: *child_pid,
                name: name.clone(),
            });
            queue.push_back((*child_pid, depth + 1));
        }
    }
    out
}

#[cfg(windows)]
pub(super) fn shell_descendants(shell_pid: u32) -> Vec<ChildProcess> {
    use std::collections::HashMap;
    use std::mem::{size_of, zeroed};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    unsafe {
        // One snapshot answers for the whole tree: every entry carries its
        // parent pid and executable name.
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let mut by_parent: HashMap<u32, Vec<(u32, String)>> = HashMap::new();
        let mut entry: PROCESSENTRY32W = zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..len]);
                if !name.is_empty() {
                    by_parent
                        .entry(entry.th32ParentProcessID)
                        .or_default()
                        .push((entry.th32ProcessID, executable_name(&name)));
                }
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        walk_descendants(shell_pid, &by_parent)
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn proc_pidpath(pid: libc::c_int, buffer: *mut libc::c_char, size: libc::c_uint)
        -> libc::c_int;
}

#[cfg(target_os = "macos")]
fn process_path(pid: libc::c_int) -> String {
    const PROC_PIDPATHINFO_MAXSIZE: libc::c_uint = 4096;
    let mut buffer = vec![0 as libc::c_char; PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: the buffer is ours and sized to the documented maximum.
    let len = unsafe { proc_pidpath(pid, buffer.as_mut_ptr(), PROC_PIDPATHINFO_MAXSIZE) };
    if len <= 0 {
        return String::new();
    }
    let bytes = unsafe { std::slice::from_raw_parts(buffer.as_ptr().cast::<u8>(), len as usize) };
    String::from_utf8_lossy(bytes).to_string()
}

#[cfg(target_os = "macos")]
pub(super) fn shell_descendants(shell_pid: u32) -> Vec<ChildProcess> {
    use std::collections::HashMap;
    let mut by_parent: HashMap<u32, Vec<(u32, String)>> = HashMap::new();
    collect_macos_children(shell_pid, 0, &mut by_parent);
    walk_descendants(shell_pid, &by_parent)
}

#[cfg(target_os = "macos")]
fn collect_macos_children(
    pid: u32,
    depth: usize,
    by_parent: &mut std::collections::HashMap<u32, Vec<(u32, String)>>,
) {
    if depth >= MAX_DEPTH {
        return;
    }
    // A NULL buffer query returns how many children the process has, so the
    // second call can fill an exactly sized list.
    let count = unsafe { libc::proc_listchildpids(pid as libc::pid_t, std::ptr::null_mut(), 0) };
    if count < 1 {
        return;
    }
    let mut pids: Vec<libc::pid_t> = vec![0; count as usize];
    let listed = unsafe {
        libc::proc_listchildpids(
            pid as libc::pid_t,
            pids.as_mut_ptr().cast(),
            (pids.len() * std::mem::size_of::<libc::pid_t>()) as libc::c_int,
        )
    };
    for &child in pids.iter().take(listed.max(0) as usize) {
        let name = executable_name(&process_path(child as libc::c_int));
        by_parent.entry(pid).or_default().push((child, name));
        collect_macos_children(child, depth + 1, by_parent);
    }
}

/// Parent pid and command name from `/proc/<pid>/stat`:
/// `pid (comm) state ppid ...` where `comm` may contain spaces and
/// parentheses, so anchor on the first `(` and the last `)`.
#[cfg(any(target_os = "linux", test))]
fn stat_pid_comm(stat: &str) -> Option<(u32, String)> {
    let open = stat.find('(')?;
    let close = stat.rfind(')')?;
    if close < open {
        return None;
    }
    let comm = stat[open + 1..close].to_string();
    let after = &stat[close + 1..];
    let parent: u32 = after.split_whitespace().nth(1)?.parse().ok()?;
    Some((parent, comm))
}

#[cfg(target_os = "linux")]
pub(super) fn shell_descendants(shell_pid: u32) -> Vec<ChildProcess> {
    use std::collections::HashMap;
    let mut by_parent: HashMap<u32, Vec<(u32, String)>> = HashMap::new();
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let Some(pid) = file_name.to_str() else {
                continue;
            };
            if pid.is_empty() || !pid.bytes().all(|b| b.is_ascii_digit()) {
                continue;
            }
            let Ok(stat) = std::fs::read_to_string(entry.path().join("stat")) else {
                continue;
            };
            let Some((parent, comm)) = stat_pid_comm(&stat) else {
                continue;
            };
            by_parent
                .entry(parent)
                .or_default()
                .push((pid.parse().unwrap_or(0), comm));
        }
    }
    walk_descendants(shell_pid, &by_parent)
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
pub(super) fn shell_descendants(shell_pid: u32) -> Vec<ChildProcess> {
    let mut out = Vec::new();
    collect_pgrep_children(shell_pid, 0, &mut out);
    out
}

#[cfg(all(unix, not(any(target_os = "macos", target_os = "linux"))))]
fn collect_pgrep_children(pid: u32, depth: usize, out: &mut Vec<ChildProcess>) {
    if depth >= MAX_DEPTH || out.len() >= MAX_PROCESSES {
        return;
    }
    let Ok(listing) = std::process::Command::new("pgrep")
        .args(["-P", &pid.to_string()])
        .output()
    else {
        return;
    };
    for field in String::from_utf8_lossy(&listing.stdout).split_whitespace() {
        let Ok(child) = field.parse::<u32>() else {
            continue;
        };
        let name = std::process::Command::new("ps")
            .args(["-o", "comm=", "-p", &child.to_string()])
            .output()
            .ok()
            .map(|o| executable_name(String::from_utf8_lossy(&o.stdout).trim()))
            .unwrap_or_default();
        out.push(ChildProcess { pid: child, name });
        collect_pgrep_children(child, depth + 1, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_files_list_pids_or_nothing() {
        assert!(!children_listed(""));
        assert!(!children_listed("  \n"));
        assert!(children_listed("1234 "));
        assert!(children_listed("1 2 3\n"));
    }

    #[test]
    fn stat_parent_survives_awkward_command_names() {
        assert_eq!(stat_parent("42 (zsh) S 7 42 42 0 -1"), Some(7));
        assert_eq!(stat_parent("42 (a b) c) S 9 42"), Some(9));
        assert_eq!(stat_parent("42 (x) S"), None);
        assert_eq!(stat_parent("garbage"), None);
    }

    #[test]
    fn stat_pid_comm_extracts_parent_and_name() {
        assert_eq!(
            stat_pid_comm("42 (claude) S 7 42 42 0 -1"),
            Some((7, "claude".to_string()))
        );
        assert_eq!(
            stat_pid_comm("9 (a b) c) R 3"),
            Some((3, "a b) c".to_string()))
        );
        assert_eq!(stat_pid_comm("42 (x) S"), None);
        assert_eq!(stat_pid_comm("garbage"), None);
    }

    #[test]
    fn executable_name_takes_the_base_name() {
        assert_eq!(executable_name("/usr/local/bin/claude"), "claude");
        assert_eq!(executable_name(r"C:\tools\codex.exe"), "codex.exe");
        assert_eq!(executable_name("claude"), "claude");
        assert_eq!(executable_name("  gemini  "), "gemini");
        // A trailing separator must not produce an empty name.
        assert_eq!(executable_name("/usr/bin/"), "bin");
    }

    #[test]
    fn walk_descendants_is_breadth_first_and_capped() {
        let tree = [
            (1u32, vec![(2u32, "a".to_string())]),
            (2, vec![(3, "b".to_string())]),
            (3, vec![(4, "c".to_string())]),
        ]
        .into_iter()
        .collect::<std::collections::HashMap<u32, Vec<(u32, String)>>>();
        let found = walk_descendants(1, &tree);
        let names: Vec<&str> = found.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
        // An unknown root yields nothing.
        assert!(walk_descendants(999, &tree).is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn detects_real_children_without_forking_a_helper() {
        let me = std::process::id();
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn sleep");
        assert!(shell_has_children(me), "the sleeping child is visible");
        let _ = child.kill();
        let _ = child.wait();
        // A leaf process (the child itself) has none.
        let leaf = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn leaf");
        assert!(!shell_has_children(leaf.id()));
        let mut leaf = leaf;
        let _ = leaf.kill();
        let _ = leaf.wait();
    }

    #[cfg(unix)]
    #[test]
    fn a_missing_process_has_no_children() {
        // PID 0x7fff_fff0 is far above any real pid on supported systems.
        assert!(!shell_has_children(0x7fff_fff0));
    }
}
