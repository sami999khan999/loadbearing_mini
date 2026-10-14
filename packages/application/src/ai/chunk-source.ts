const DOC = "doc";

// Frozen at module load: the keyword freezes the binding, not the array.
const GUARDED = Object.freeze([DOC] as const);

// The `sourceType` values that mean something to more than the indexer. A guarded type's
// chunks carry their own read rule, so the shared document search never ranks them.
export class ChunkSource {
  private constructor() {}

  // A published Docs page, indexed by `DocIndexSubscriber` and read only through `DocSearch`.
  public static readonly DOC = DOC;

  public static readonly GUARDED: readonly string[] = GUARDED;

  public static isGuarded(sourceType: string): boolean {
    return GUARDED.includes(sourceType as typeof DOC);
  }
}
