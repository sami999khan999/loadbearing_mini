import { ValidationError } from "@loadbearing/errors";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useErrorMessage } from "../../src/error/use-error-message.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

function Probe({ error }: { readonly error: unknown }) {
  const describe = useErrorMessage();
  return <p>{describe(error)?.message}</p>;
}

// A form shows `message`, and none renders `fields`: a bad email read "Something went
// wrong", the code's sentence, though the server had named the field.
describe("useErrorMessage", () => {
  it("says what is wrong with each field when the server named them", async () => {
    await renderWithFakes(
      <Probe error={new ValidationError([{ field: "email", rule: "invalidFormat" }])} />,
      capabilitiesWith([]),
    );

    expect(screen.getByText("email is not in the expected format.")).toBeDefined();
  });
});
