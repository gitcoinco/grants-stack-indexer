export const minutes = (n: number) => n * 60 * 1000;
export const hours = (n: number) => minutes(60) * n;
export const days = (n: number) => hours(24) * n;
