/**
 * RMA (physical repair/replace/refund inspection) state machine (HUB-43 AC2).
 *
 * The graph (each entry lists the `to` statuses legal from that `from`):
 *
 *   REQUESTED   -> REVIEW
 *   REVIEW      -> APPROVED, REJECTED
 *   APPROVED    -> RECEIVED
 *   REJECTED    -> (terminal)
 *   RECEIVED    -> INSPECTING
 *   INSPECTING  -> REPAIR, REPLACE, REFUND
 *   REPAIR      -> COMPLETED
 *   REPLACE     -> COMPLETED
 *   REFUND      -> COMPLETED
 *   COMPLETED   -> (terminal)
 *
 * Unlike HUB-42's claim state machine, there is no override concept here --
 * the architect determined none is needed for RMA (physical inspection has
 * no "warranty expired but we'll allow it anyway" analog), so this module
 * deliberately has no override-aware variant.
 */

import type { RmaStatus } from "@prisma/client";

const RMA_TRANSITIONS: Record<RmaStatus, readonly RmaStatus[]> = {
  REQUESTED: ["REVIEW"],
  REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["RECEIVED"],
  REJECTED: [],
  RECEIVED: ["INSPECTING"],
  INSPECTING: ["REPAIR", "REPLACE", "REFUND"],
  REPAIR: ["COMPLETED"],
  REPLACE: ["COMPLETED"],
  REFUND: ["COMPLETED"],
  COMPLETED: [],
};

/** Whether `to` is a legal next status directly from `from`. No self-transitions, no skipping steps. */
export function isValidRmaTransition(from: RmaStatus, to: RmaStatus): boolean {
  return RMA_TRANSITIONS[from].includes(to);
}

/** Every status directly reachable from `from` -- used to render "advance to" choices in the admin UI. */
export function nextValidRmaStatuses(from: RmaStatus): readonly RmaStatus[] {
  return RMA_TRANSITIONS[from];
}
