import { vi, expect, test, describe } from "vitest";

import { createResourceMonitor } from "./resourceMonitor.js";

vi.mock("diskstats", () => {
  return {
    default: {
      check: () => ({
        total: 100,
        used: 50,
        inodes: {
          total: 100,
          used: 60,
        },
      }),
    },
  };
});

describe("ResourceMonitor", () => {
  test("reporting", async () => {
    vi.useFakeTimers();
    const log = vi.fn();

    const monitor = createResourceMonitor({
      log,
      pollingIntervalMs: 1000,
    });

    monitor.start();

    // first log
    {
      await vi.runOnlyPendingTimersAsync();

      expect(log).toHaveBeenCalledTimes(2);

      expect(log).toHaveBeenCalledWith({
        type: "disk",
        total: 100,
        used: 50,
      });

      expect(log).toHaveBeenCalledWith({
        type: "inode",
        total: 100,
        used: 60,
      });
    }

    // loggin should continue after the first interval
    {
      log.mockClear();
      await vi.runOnlyPendingTimersAsync();

      expect(log).toHaveBeenCalledTimes(2);

      expect(log).toHaveBeenCalledWith({
        type: "disk",
        total: 100,
        used: 50,
      });

      expect(log).toHaveBeenCalledWith({
        type: "inode",
        total: 100,
        used: 60,
      });
    }

    // no reporting should happen after the monitor is stopped
    {
      log.mockClear();
      monitor.stop();

      await vi.runOnlyPendingTimersAsync();

      expect(log).toHaveBeenCalledTimes(0);
    }
  });
});
