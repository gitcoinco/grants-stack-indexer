export function wait(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export function memoize<Input, Output>(
  fn: (arg0: Input) => Output
): (arg0: Input) => Output {
  const cache = new Map();
  return (arg0: Input) => {
    if (cache.has(arg0)) {
      return cache.get(arg0) as Output;
    } else {
      const ret = fn(arg0) ;
      cache.set(arg0, ret);
      return ret;
    }
  };
}
