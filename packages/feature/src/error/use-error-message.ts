import { useTranslator } from "../i18n/index.js";
import {
  ErrorCopy,
  type ErrorEnvelope,
  ErrorNormalizer,
  type Translator,
  useCallback,
} from "../import.js";

export interface ErrorMessage {
  // The sentence for the code, or the field sentences when there are any: no form renders
  // `fields`, and a bad email read "Something went wrong" through the code's sentence.
  readonly message: string;
  // One per field violation, in envelope order. Empty for anything but a validation
  // failure, so a caller renders it without asking what kind of error it holds.
  readonly fields: readonly string[];
  readonly envelope: ErrorEnvelope;
}

// Normalises whatever a mutation or query threw and renders it through `content`. Every
// call site that reached for `state.error` was discarding the code the server sent.
export function useErrorMessage() {
  const translator = useTranslator();

  return useCallback(
    (thrown: unknown): ErrorMessage | null => {
      if (thrown === null || thrown === undefined) return null;
      return describe(translator, ErrorNormalizer.normalize(thrown).toJSON());
    },
    [translator],
  );
}

function describe(translator: Translator, envelope: ErrorEnvelope): ErrorMessage {
  const fields = ErrorCopy.fields(translator, envelope);
  return {
    message: fields.length > 0 ? fields.join(" ") : ErrorCopy.message(translator, envelope),
    fields,
    envelope,
  };
}
