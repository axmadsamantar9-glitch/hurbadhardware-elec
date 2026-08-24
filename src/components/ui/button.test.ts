import { describe, it, expect, vi } from "vitest";
import type { ForwardRefExoticComponent, ReactElement, Ref, RefAttributes } from "react";
import { Button, type ButtonProps } from "./button";

/**
 * These are pure logic-level tests: React 19's `forwardRef` component is a
 * plain object `{ $$typeof, render }`. Calling `.render(props, ref)`
 * directly returns the underlying React element tree (a plain object)
 * without needing to mount into a real DOM. This project's test
 * infrastructure runs in Vitest's `node` environment (see
 * vitest.config.ts) with no jsdom/@testing-library/react dependency
 * installed — mounting/interaction tests (fireEvent clicks, computed
 * styles) are out of scope until that dependency is deliberately added.
 * See docs/agents/learnings/qa-test.md for the "no jsdom yet" convention.
 */

type RenderedButtonElement = ReactElement<Record<string, unknown>> & {
  ref: Ref<HTMLButtonElement> | null;
};

function renderButton(
  props: ButtonProps,
  ref: Ref<HTMLButtonElement> | null
): RenderedButtonElement {
  const component = Button as unknown as ForwardRefExoticComponent<
    ButtonProps & RefAttributes<HTMLButtonElement>
  > & {
    render: (props: ButtonProps, ref: Ref<HTMLButtonElement> | null) => RenderedButtonElement;
  };
  return component.render(props, ref);
}

describe("Button", () => {
  it("defaults to variant=primary, size=md, type=button", () => {
    const el = renderButton({}, null);
    expect(el.type).toBe("button");
    expect(el.props.type).toBe("button");
    expect(el.props.className).toContain("bg-primary");
    expect(el.props.className).toContain("text-primary-foreground");
    expect(el.props.className).toContain("h-10");
  });

  it("applies secondary variant classes", () => {
    const el = renderButton({ variant: "secondary" }, null);
    expect(el.props.className).toContain("bg-secondary");
    expect(el.props.className).toContain("text-secondary-foreground");
  });

  it("applies destructive variant classes", () => {
    const el = renderButton({ variant: "destructive" }, null);
    expect(el.props.className).toContain("bg-error");
    expect(el.props.className).toContain("text-error-foreground");
  });

  it("applies outline variant classes (bordered, transparent background)", () => {
    const el = renderButton({ variant: "outline" }, null);
    expect(el.props.className).toContain("border-input-border");
    expect(el.props.className).toContain("bg-transparent");
  });

  it("applies ghost variant classes (no border, transparent background)", () => {
    const el = renderButton({ variant: "ghost" }, null);
    expect(el.props.className).toContain("bg-transparent");
    expect(el.props.className).not.toContain("border-input-border");
  });

  it("applies each size's classes: sm, md, lg, icon", () => {
    expect(renderButton({ size: "sm" }, null).props.className).toContain("h-8");
    expect(renderButton({ size: "md" }, null).props.className).toContain("h-10");
    expect(renderButton({ size: "lg" }, null).props.className).toContain("h-12");
    expect(renderButton({ size: "icon" }, null).props.className).toContain("w-10");
  });

  it("merges a caller-supplied className rather than overwriting it", () => {
    const el = renderButton({ className: "my-custom-class" }, null);
    expect(el.props.className).toContain("bg-primary");
    expect(el.props.className).toContain("my-custom-class");
  });

  it("respects an explicit type override (e.g. type=submit)", () => {
    const el = renderButton({ type: "submit" }, null);
    expect(el.props.type).toBe("submit");
  });

  it("wires onClick through to the underlying <button>", () => {
    const onClick = vi.fn();
    const el = renderButton({ onClick }, null);
    expect(el.props.onClick).toBe(onClick);
  });

  it("wires disabled through to the underlying <button> and includes disabled-state classes", () => {
    const el = renderButton({ disabled: true }, null);
    expect(el.props.disabled).toBe(true);
    expect(el.props.className).toContain("disabled:opacity-50");
    expect(el.props.className).toContain("disabled:pointer-events-none");
  });

  it("forwards the ref to the rendered <button>", () => {
    const ref = { current: null };
    const el = renderButton({}, ref);
    expect(el.ref).toBe(ref);
  });

  it("includes focus-visible ring classes for keyboard-accessibility (WCAG 2.4.11)", () => {
    const el = renderButton({}, null);
    expect(el.props.className).toContain("focus-visible:ring-2");
    expect(el.props.className).toContain("focus-visible:ring-primary");
  });
});
