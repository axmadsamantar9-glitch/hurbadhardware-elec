import { describe, it, expect, vi } from "vitest";
import type { ForwardRefExoticComponent, ReactElement, Ref, RefAttributes } from "react";
import { Input, type InputProps } from "./input";

type RenderedInputElement = ReactElement<Record<string, unknown>> & {
  ref: Ref<HTMLInputElement> | null;
};

function renderInput(props: InputProps, ref: Ref<HTMLInputElement> | null): RenderedInputElement {
  const component = Input as unknown as ForwardRefExoticComponent<
    InputProps & RefAttributes<HTMLInputElement>
  > & {
    render: (props: InputProps, ref: Ref<HTMLInputElement> | null) => RenderedInputElement;
  };
  return component.render(props, ref);
}

describe("Input", () => {
  it("defaults to error=false: no aria-invalid, default border/focus classes", () => {
    const el = renderInput({}, null);
    expect(el.props["aria-invalid"]).toBeUndefined();
    expect(el.props.className).toContain("border-input-border");
    expect(el.props.className).toContain("focus-visible:ring-primary");
    expect(el.props.className).not.toContain("border-error");
  });

  it("applies error styling and aria-invalid when error=true", () => {
    const el = renderInput({ error: true }, null);
    expect(el.props["aria-invalid"]).toBe(true);
    expect(el.props.className).toContain("border-error");
    expect(el.props.className).toContain("focus-visible:ring-error");
    expect(el.props.className).not.toContain("border-input-border");
  });

  it("wires value and onChange through to the underlying <input>", () => {
    const onChange = vi.fn();
    const el = renderInput({ value: "hello", onChange }, null);
    expect(el.props.value).toBe("hello");
    expect(el.props.onChange).toBe(onChange);
  });

  it("wires disabled through and includes disabled-state classes", () => {
    const el = renderInput({ disabled: true }, null);
    expect(el.props.disabled).toBe(true);
    expect(el.props.className).toContain("disabled:cursor-not-allowed");
    expect(el.props.className).toContain("disabled:opacity-50");
  });

  it("merges a caller-supplied className rather than overwriting it", () => {
    const el = renderInput({ className: "w-64" }, null);
    expect(el.props.className).toContain("w-64");
    expect(el.props.className).toContain("border-input-border");
  });

  it("forwards other native input attributes (placeholder, type, name)", () => {
    const el = renderInput({ placeholder: "Email", type: "email", name: "email" }, null);
    expect(el.props.placeholder).toBe("Email");
    expect(el.props.type).toBe("email");
    expect(el.props.name).toBe("email");
  });

  it("forwards the ref to the rendered <input>", () => {
    const ref = { current: null };
    const el = renderInput({}, ref);
    expect(el.ref).toBe(ref);
  });

  it("renders an <input> element", () => {
    const el = renderInput({}, null);
    expect(el.type).toBe("input");
  });
});
