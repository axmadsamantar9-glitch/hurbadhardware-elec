import type { OrderStatus } from "@prisma/client";
import type { OrderTimelineStage } from "@/lib/order-timeline";

/**
 * Renders the Placed -> Processing -> Shipped -> Delivered (or ->
 * Cancelled) timeline (AC3/AC5). Framework-agnostic — labels are passed in
 * as props rather than calling `useTranslations()` internally, matching
 * this repo's convention for shared display components (see
 * src/components/storefront/product-card.tsx's `labels` prop) so this same
 * component works from both the authenticated order-detail Server Component
 * and the public tracking Client Component.
 */
export function OrderStatusTimeline({
  stages,
  labels,
  locale,
}: {
  stages: OrderTimelineStage[];
  labels: Record<OrderStatus, string>;
  locale: string;
}) {
  const dateFormatter = new Intl.DateTimeFormat(locale === "so" ? "so" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <ol className="space-y-4">
      {stages.map((stage, index) => {
        const reached = stage.timestamp !== null;
        const isCancelled = stage.status === "CANCELLED";
        return (
          <li key={stage.status} className="flex items-start gap-3">
            <span
              className={`mt-1 flex h-3 w-3 shrink-0 rounded-full ${
                isCancelled
                  ? "bg-red-600"
                  : reached
                    ? "bg-blue-600"
                    : "border-2 border-zinc-300 bg-white"
              }`}
              aria-hidden="true"
            />
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  isCancelled ? "text-red-700" : reached ? "text-zinc-900" : "text-zinc-400"
                }`}
              >
                {labels[stage.status]}
              </p>
              {reached && stage.timestamp && (
                <p className="text-xs text-zinc-500">{dateFormatter.format(stage.timestamp)}</p>
              )}
            </div>
            {index < stages.length - 1 && (
              <span className="sr-only" aria-hidden="true">
                {" "}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
