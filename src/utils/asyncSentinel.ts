// A utility class necessary because promise state is not inspectable, otherwise
// plain promise could be used.

export class AsyncSentinel {
  _promise: Promise<void>;
  _resolve: null | (() => void) = null;
  _isDone: boolean = false;

  constructor() {
    this._promise = new Promise((resolve) => {
      this._resolve = resolve;
    });
  }

  untilDone() {
    return this._promise;
  }

  isDone() {
    return this._isDone;
  }

  declareDone() {
    if (this._resolve === null) {
      throw new Error("Promise has not had the time to initialize");
    }
    if (!this._isDone) {
      this._isDone = true;
      this._resolve();
    }
  }
}
