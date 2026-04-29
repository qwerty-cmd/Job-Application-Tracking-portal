import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawerDialog } from "./DrawerDialog";

// Keep useIsMobile deterministic in these tests
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));

function renderDrawerDialog(open: boolean, onOpenChange = vi.fn()) {
  return render(
    <DrawerDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Test Title"
      description="Test description"
    >
      <p>Dialog content</p>
    </DrawerDialog>,
  );
}

describe("DrawerDialog", () => {
  it("renders the title when open", () => {
    renderDrawerDialog(true);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("renders children when open", () => {
    renderDrawerDialog(true);
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    renderDrawerDialog(false);
    expect(screen.queryByText("Dialog content")).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) when the dialog is closed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDrawerDialog(true, onOpenChange);

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalled();
    expect(onOpenChange.mock.calls[0][0]).toBe(false);
  });
});
