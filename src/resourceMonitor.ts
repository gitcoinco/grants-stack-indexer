import { Logger } from "pino";

interface ResourceMonitor {
  start: () => void;
  stop: () => void;
}

interface ResourceMonitorConfig {
  diskstats: typeof import("diskstats");
  logger: Logger;
  directories: string[];
  pollingIntervalMs: number;
}

export function createResourceMonitor({
  logger,
  diskstats,
  directories,
  pollingIntervalMs,
}: ResourceMonitorConfig): ResourceMonitor {
  let pollingTimer: NodeJS.Timeout | null = null;

  const pollResources = async () => {
    for (const directory of directories) {
      const stats = await diskstats.check(directory);

      const totalDiskSpace = stats.total;
      const totalDiskUsed = stats.used;

      logger.info({
        type: "disk",
        directory,
        total: totalDiskSpace,
        used: totalDiskUsed,
      });

      const totalInodes = stats.inodes.total;
      const totalInodesUsed = stats.inodes.used;

      logger.info({
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
