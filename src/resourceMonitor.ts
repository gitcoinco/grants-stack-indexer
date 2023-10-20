import diskstats from "diskstats";

export type ResourceLog =
  | {
      type: "inode";
      directory: string;
      total: number;
      used: number;
    }
  | {
      type: "disk";
      directory: string;
      total: number;
      used: number;
    };

interface ResourceMonitor {
  start: () => void;
  stop: () => void;
}

interface ResourceMonitorConfig {
  log: (log: ResourceLog) => void;
  directories: string[];
  pollingIntervalMs: number;
}

export function createResourceMonitor({
  log,
  directories,
  pollingIntervalMs,
}: ResourceMonitorConfig): ResourceMonitor {
  let pollingTimer: NodeJS.Timeout | null = null;

  const pollResources = async () => {
    for (const directory of directories) {
      const stats = await diskstats.check(directory);

      const totalDiskSpace = stats.total;
      const totalDiskUsed = stats.used;

      log({
        type: "disk",
        directory,
        total: totalDiskSpace,
        used: totalDiskUsed,
      });

      const totalInodes = stats.inodes.total;
      const totalInodesUsed = stats.inodes.used;

      log({
        type: "inode",
        directory,
        total: totalInodes,
        used: totalInodesUsed,
      });
    }

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
