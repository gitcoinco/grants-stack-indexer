import diskstats from "diskstats";

export type ResourceLog =
  | {
      type: "inode";
      total: number;
      used: number;
    }
  | {
      type: "disk";
      total: number;
      used: number;
    };

interface ResourceMonitor {
  start: () => void;
  stop: () => void;
}

interface ResourceMonitorConfig {
  log: (log: ResourceLog) => void;
  pollingIntervalMs: number;
}

export function createResourceMonitor({
  log,
  pollingIntervalMs,
}: ResourceMonitorConfig): ResourceMonitor {
  let pollingTimer: NodeJS.Timeout | null = null;

  const pollResources = async () => {
    const stats = await diskstats.check("/");

    const totalDiskSpace = stats.total;
    const totalDiskUsed = stats.used;

    log({
      type: "disk",
      total: totalDiskSpace,
      used: totalDiskUsed,
    });

    const totalInodes = stats.inodes.total;
    const totalInodesUsed = stats.inodes.used;

    log({
      type: "inode",
      total: totalInodes,
      used: totalInodesUsed,
    });

    if (pollingTimer) {
      pollingTimer = setTimeout(pollResources, pollingIntervalMs);
    }
  };

  const start = () => {
    if (pollingTimer !== null) {
      throw new Error("ResourceMonitor already started");
    }

    pollingTimer = setTimeout(pollResources, 0);
  };

  const stop = () => {
    if (pollingTimer === null) {
      throw new Error("ResourceMonitor not started");
    }

    clearTimeout(pollingTimer);
    pollingTimer = null;
  };

  return {
    start,
    stop,
  };
}
