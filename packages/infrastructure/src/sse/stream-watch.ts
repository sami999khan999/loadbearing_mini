import type { CancellationSignal } from "../import.js";

// One `AbortController` for a streamed request, aborted by whichever comes first: the
// caller's signal, or no byte arriving within the window `arm` last set.
export class StreamWatch {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timedOut = false;
  private readonly onCancel = (): void => this.controller.abort();

  public constructor(private readonly cancel?: CancellationSignal) {
    if (cancel?.aborted) this.controller.abort();
    cancel?.addEventListener("abort", this.onCancel);
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  // True when the caller cancelled: the stream stops quietly, because nothing failed.
  public get cancelled(): boolean {
    return this.controller.signal.aborted && !this.timedOut;
  }

  // Restarts the window. The first-byte window before the request, the idle window after
  // each chunk: a model that thinks before writing gets the longer one only once.
  public arm(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.controller.abort();
    }, ms);
  }

  public dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.cancel?.removeEventListener("abort", this.onCancel);
  }
}
