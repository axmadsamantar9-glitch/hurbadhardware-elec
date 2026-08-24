import { describe, it, expect } from "vitest";
import type { ForwardRefExoticComponent, ReactElement, Ref, RefAttributes } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
} from "./card";

type RenderedCardElement = ReactElement<Record<string, unknown>> & {
  ref: Ref<HTMLDivElement> | null;
};

function renderCard(
  Component: ForwardRefExoticComponent<CardProps & RefAttributes<HTMLDivElement>>,
  props: CardProps,
  ref: Ref<HTMLDivElement> | null
): RenderedCardElement {
  const component = Component as unknown as ForwardRefExoticComponent<
    CardProps & RefAttributes<HTMLDivElement>
  > & {
    render: (props: CardProps, ref: Ref<HTMLDivElement> | null) => RenderedCardElement;
  };
  return component.render(props, ref);
}

describe("Card and subcomponents", () => {
  it("Card renders a div with token-driven border/background/shadow classes", () => {
    const el = renderCard(Card, { children: "content" }, null);
    expect(el.type).toBe("div");
    expect(el.props.className).toContain("border-border");
    expect(el.props.className).toContain("bg-background");
    expect(el.props.children).toBe("content");
  });

  it("CardHeader renders a div with header spacing classes", () => {
    const el = renderCard(CardHeader, {}, null);
    expect(el.type).toBe("div");
    expect(el.props.className).toContain("p-6");
  });

  it("CardTitle renders a div with heading-emphasis classes", () => {
    const el = renderCard(CardTitle, {}, null);
    expect(el.props.className).toContain("font-semibold");
  });

  it("CardDescription renders a div with muted-foreground text classes", () => {
    const el = renderCard(CardDescription, {}, null);
    expect(el.props.className).toContain("text-muted-foreground");
  });

  it("CardContent renders a div with content padding classes", () => {
    const el = renderCard(CardContent, {}, null);
    expect(el.props.className).toContain("p-6");
    expect(el.props.className).toContain("pt-0");
  });

  it("CardFooter renders a div with footer layout classes", () => {
    const el = renderCard(CardFooter, {}, null);
    expect(el.props.className).toContain("flex");
    expect(el.props.className).toContain("items-center");
  });

  it("every subcomponent merges a caller-supplied className", () => {
    const subcomponents = [Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter];
    for (const Sub of subcomponents) {
      const el = renderCard(Sub, { className: "my-extra" }, null);
      expect(el.props.className).toContain("my-extra");
    }
  });

  it("every subcomponent forwards its ref", () => {
    const subcomponents = [Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter];
    for (const Sub of subcomponents) {
      const ref = { current: null };
      const el = renderCard(Sub, {}, ref);
      expect(el.ref).toBe(ref);
    }
  });

  it("compose together: Card > CardHeader > CardTitle/CardDescription, CardContent, CardFooter", () => {
    const title = renderCard(CardTitle, { children: "Product Name" }, null);
    const description = renderCard(CardDescription, { children: "Product description" }, null);
    const header = renderCard(CardHeader, { children: [title, description] }, null);
    const content = renderCard(CardContent, { children: "Body" }, null);
    const footer = renderCard(CardFooter, { children: "Actions" }, null);
    const card = renderCard(Card, { children: [header, content, footer] }, null);

    expect(card.props.children).toEqual([header, content, footer]);
    expect(header.props.children).toEqual([title, description]);
    expect(title.props.children).toBe("Product Name");
    expect(description.props.children).toBe("Product description");
  });
});
