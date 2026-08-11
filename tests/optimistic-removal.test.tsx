import { expect, test } from "bun:test";
import React from "react";
import { render, screen } from "@testing-library/react";
import { useOptimisticRemoval } from "../components/use-optimistic-removal";

function Harness({ ids, hideId }: { ids: string[]; hideId?: string }) {
  const { hide, isHidden, settle } = useOptimisticRemoval();
  React.useEffect(() => {
    if (hideId) hide(hideId);
  }, [hideId, hide]);
  React.useEffect(() => {
    settle(ids);
  }, [ids, settle]);
  return (
    <ul>
      {ids.filter((id) => !isHidden(id)).map((id) => (
        <li key={id}>{id}</li>
      ))}
    </ul>
  );
}

test("a hidden row disappears immediately", () => {
  render(<Harness ids={["a", "b", "c"]} hideId="b" />);
  expect(screen.queryByText("b")).toBeNull();
  expect(screen.getByText("a")).toBeDefined();
});

test("rows stay hidden while the query still reports them", () => {
  const { rerender } = render(<Harness ids={["a", "b"]} hideId="b" />);
  rerender(<Harness ids={["a", "b"]} hideId="b" />);
  expect(screen.queryByText("b")).toBeNull();
});

test("nothing is hidden without a delete", () => {
  render(<Harness ids={["a", "b"]} />);
  expect(screen.getByText("a")).toBeDefined();
  expect(screen.getByText("b")).toBeDefined();
});
