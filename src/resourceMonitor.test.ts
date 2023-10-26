import { vi, expect, test, describe } from "vitest";

import { createResourceMonitor } from "./resourceMonitor.js";
import { pino } from "pino";

describe("ResourceMonitor", () => {
  test("reporting at interval", async () => {
    vi.useFakeTimers();
    const logger = pino();

    const logInfoMock = vi.spyOn(logger, "info").mockImplementation(() => {});

    const monitor = createResourceMonitor({
      logger,
      diskstats: {
        check: () =>
          Promise.resolve({
            total: 100,
            used: 50,
            inodes: {
              total: 100,
              used: 60,
            },
          }),
      },
      directories: ["/"],
      pollingIntervalMs: 1000,
    });

    monitor.start();

    await vi.runOnlyPendingTimersAsync();

    expect(logInfoMock).toHaveBeenCalledTimes(2);

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "disk",
      directory: "/",
      total: 100,
      used: 50,
    });

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "inode",
      directory: "/",
      total: 100,
      used: 60,
    });

    // loggin should continue after the first interval
    logInfoMock.mockClear();
    await vi.runOnlyPendingTimersAsync();

    expect(logInfoMock).toHaveBeenCalledTimes(2);

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "disk",
      directory: "/",
      total: 100,
      used: 50,
    });

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "inode",
      directory: "/",
      total: 100,
      used: 60,
    });

    monitor.stop();
  });

  test("stop monitor", async () => {
    vi.useFakeTimers();
    const logger = pino();

    const logInfoMock = vi.spyOn(logger, "info").mockImplementation(() => {});

    const monitor = createResourceMonitor({
      logger,
      diskstats: {
        check: () =>
          Promise.resolve({
            total: 100,
            used: 50,
            inodes: {
              total: 100,
              used: 60,
            },
          }),
      },
      directories: ["/"],
      pollingIntervalMs: 1000,
    });

    monitor.start();

    // first log
    await vi.runOnlyPendingTimersAsync();

    expect(logInfoMock).toHaveBeenCalledTimes(2);

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "disk",
      directory: "/",
      total: 100,
      used: 50,
    });

    expect(logInfoMock).toHaveBeenCalledWith({
      type: "inode",
      directory: "/",
      total: 100,
      used: 60,
    });

    // no reporting should happen after the monitor is stopped
    logInfoMock.mockClear();
    monitor.stop();

    await vi.runOnlyPendingTimersAsync();

    expect(logInfoMock).toHaveBeenCalledTimes(0);
  });
});
