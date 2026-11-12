import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationCreateForm } from "../../src/messaging/conversation-create.form.js";
import { capabilitiesWith, renderWithFakes, TEST_USER } from "../support/render-with-fakes.js";

const GRACE = "00000000-0000-7000-8000-000000000002";
const ALAN = "00000000-0000-7000-8000-000000000003";
const GONE = "00000000-0000-7000-8000-000000000004";
const CREATED = "00000000-0000-7000-8000-0000000000c9";

const member = (userId: string, name: string, deactivated = false) => ({
  userId,
  name,
  email: `${name.toLowerCase()}@example.test`,
  roleId: "00000000-0000-7000-8000-0000000000f1",
  roleKey: "member",
  roleName: "Member",
  joinedAt: new Date("2026-09-01T00:00:00.000Z"),
  deactivated,
  suspended: false,
  exceptions: 0,
});

const mount = () => {
  const create = vi.fn((_input: unknown) => Promise.resolve({ id: CREATED }));
  const onCreated = vi.fn();
  const client = {
    member: {
      list: () =>
        Promise.resolve({
          items: [
            member(TEST_USER.id, "Ada"),
            member(GRACE, "Grace"),
            member(ALAN, "Alan"),
            member(GONE, "Gone", true),
          ],
          total: 4,
        }),
    },
    conversation: { create },
  } as unknown as ApiClient;
  return {
    create,
    onCreated,
    render: () =>
      renderWithFakes(
        <ConversationCreateForm onCreated={onCreated} />,
        capabilitiesWith(["messaging.conversation.create", "member.read"]),
        TEST_USER,
        ["messaging"],
        client,
      ),
  };
};

// `WK.1`. The inbox said "Start one to see it here" and offered no way to.
describe("ConversationCreateForm", () => {
  it("offers everyone else still active, never the asker", async () => {
    const { render } = mount();
    await render();

    expect(await screen.findByRole("checkbox", { name: "Grace" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Alan" })).toBeDefined();
    expect(screen.queryByRole("checkbox", { name: "Ada" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Gone" })).toBeNull();
  });

  it("starts a direct message with one person and no name, then opens it", async () => {
    const { render, create, onCreated } = mount();
    await render();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Grace" }));
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CREATED));
    expect(create.mock.calls[0]?.[0]).toEqual({ kind: "direct", memberIds: [GRACE] });
  });

  it("makes a named group of several", async () => {
    const { render, create } = mount();
    await render();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Grace" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Alan" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Launch" } });
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0]?.[0]).toEqual({
      kind: "channel",
      memberIds: [GRACE, ALAN],
      title: "Launch",
    });
  });

  it("cannot start with nobody picked", async () => {
    const { render } = mount();
    await render();

    await screen.findByRole("checkbox", { name: "Grace" });
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
  });
});
