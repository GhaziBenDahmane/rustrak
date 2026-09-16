//! What the process costs: RSS sampled every minute and folded into one
//! min/max/last per window, plus the read-once facts about the host.

use std::sync::Mutex;

use serde::Serialize;

/// Resident set size over one window, in megabytes.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
pub struct Rss {
    pub min: Option<u64>,
    pub max: Option<u64>,
    pub last: Option<u64>,
}

#[derive(Default)]
pub struct Sampler {
    rss: Mutex<Rss>,
}

impl Sampler {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_rss_mb(&self, mb: u64) {
        let mut rss = self.rss.lock().unwrap_or_else(|e| e.into_inner());
        rss.min = Some(rss.min.map_or(mb, |m| m.min(mb)));
        rss.max = Some(rss.max.map_or(mb, |m| m.max(mb)));
        rss.last = Some(mb);
    }

    /// Reads the window and leaves it as it is.
    pub fn snapshot(&self) -> Rss {
        *self.rss.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Reads the window and seeds the next one with the last reading, so a
    /// quiet window still reports the memory the process holds.
    pub fn snapshot_and_reset(&self) -> Rss {
        let mut rss = self.rss.lock().unwrap_or_else(|e| e.into_inner());
        let out = *rss;
        *rss = Rss {
            min: out.last,
            max: out.last,
            last: out.last,
        };
        out
    }
}

/// Host and process facts read from `/proc`. `None` off Linux, and on a
/// Linux where `/proc` is not mounted.
pub mod probe {
    /// Resident set size of this process, in megabytes. `VmRSS` is already
    /// in kB, which sidesteps the page size that differs across aarch64 kernels.
    pub fn rss_mb() -> Option<u64> {
        kb_field("/proc/self/status", "VmRSS:").map(|kb| kb / 1024)
    }

    /// Total memory of the host, in megabytes.
    pub fn mem_total_mb() -> Option<u64> {
        kb_field("/proc/meminfo", "MemTotal:").map(|kb| kb / 1024)
    }

    /// Whether the process runs inside a container.
    pub fn container() -> bool {
        std::path::Path::new("/.dockerenv").exists()
            || std::fs::read_to_string("/proc/1/cgroup")
                .map(|c| c.contains("docker") || c.contains("kubepods") || c.contains("containerd"))
                .unwrap_or(false)
    }

    /// The `<label> <n> kB` line of a `/proc` file.
    fn kb_field(path: &str, label: &str) -> Option<u64> {
        let text = std::fs::read_to_string(path).ok()?;
        let line = text.lines().find(|l| l.starts_with(label))?;
        line.split_whitespace().nth(1)?.parse().ok()
    }
}
