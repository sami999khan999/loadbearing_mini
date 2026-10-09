import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageScrollbar } from "../../../src/component/page-scrollbar/page-scrollbar.js";
import { Sidebar } from "../../../src/component/sidebar/sidebar.js";

// jsdom has no `matchMedia`; a narrow screen is one whose `lg` query does not match.
function narrowScreen() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Menu
      </button>
      <Sidebar label="Docs" open={open} onOpenChange={setOpen} closeLabel="Close">
        <a href="#one">one</a>
        <a href="#two">two</a>
      </Sidebar>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("Sidebar", () => {
  // Inside PageScrollbar, as in the app: its scroll area then adds no stylesheet of its own.
  it("is a named region holding its slots on a wide screen, with no close button", () => {
    render(
      <PageScrollbar>
        <Sidebar label="Docs" header={<p>head</p>} footer={<p>foot</p>} closeLabel="Close">
          <p>body</p>
        </Sidebar>
      </PageScrollbar>,
    );
    expect(screen.getByRole("complementary", { name: "Docs" }).textContent).toBe("headbodyfoot");
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing on a narrow screen until opened", () => {
    narrowScreen();
    render(
      <Sidebar label="Docs" closeLabel="Close">
        <p>body</p>
      </Sidebar>,
    );
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("opens as a modal drawer that keeps focus inside it", async () => {
    narrowScreen();
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const drawer = await screen.findByRole("dialog", { name: "Docs" });
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    // The page behind is out of reach: Base UI marks it inert or hides it from assistive tech.
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
  });

  it("closes on Escape and returns focus to the button that opened it", async () => {
    narrowScreen();
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Menu" });
    act(() => opener.focus());
    fireEvent.click(opener);

    const drawer = await screen.findByRole("dialog", { name: "Docs" });
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? drawer, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes from its close button", async () => {
    narrowScreen();
    const onOpenChange = vi.fn();
    render(
      <Sidebar label="Docs" open onOpenChange={onOpenChange} closeLabel="Close">
        <p>body</p>
      </Sidebar>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
