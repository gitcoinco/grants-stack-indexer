declare module "diskstats" {
  interface InodeInfo {
    total: number;
    used: number;
  }

  interface DiskStatsInfo {
    total: number;
    used: number;
    inodes: InodeInfo;
  }

  function check(path: string): Promise<DiskStatsInfo>;

  export = {
    check,
  };
}
