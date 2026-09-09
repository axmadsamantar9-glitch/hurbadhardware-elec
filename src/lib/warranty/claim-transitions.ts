/**
 * Warranty claim state machine (HUB-42 AC6 / PRD §6.9).
 *
 * PRD §6.9's exact wording for the legal chain:
 *   "Requested -> eligibility review -> approved/rejected ->
 *    troubleshooting/diagnosis -> service/repair -> replacement OR refund ->
 *    completed/closed."
 *
 * That prose is a description of the *happy path*, not a literal adjacency
 * list -- read literally it would route REJECTED claims into
 * TROUBLESHOOTING, which contradicts "rejected" meaning the claim does not
 * proceed. This module resolves the ambiguity the same way any claim-review
 * workflow would: REJECTED is a terminal branch off ELIGIBILITY_REVIEW that
 * goes straight to CLOSED, while APPROVED is the only branch that continues
 * into the repair pipeline. Every other step in the prose (eligibility
 * review, troubleshooting/diagnosis, service/repair, replacement OR refund,
 * completed/closed) is encoded literally and un-ambiguously below.
 *
 * The graph (each entry lists the `to` statuses legal from that `from`):
 *
 *   REQUESTED           -> ELIGIBILITY_REVIEW
 *   ELIGIBILITY_REVIEW  -> APPROVED, REJECTED
 *   APPROVED            -> TROUBLESHOOTING
 *   REJECTED            -> CLOSED
 *   TROUBLESHOOTING     -> SERVICE_REPAIR
 *   SERVICE_REPAIR      -> REPLACEMENT, REFUND
 *   REPLACEMENT         -> COMPLETED
 *   REFUND              -> COMPLETED
 *   COMPLETED           -> CLOSED
 *   CLOSED              -> (terminal, no further transitions)
 */

import type { WarrantyClaimStatus } from "@prisma/client";

const CLAIM_TRANSITIONS: Record<WarrantyClaimStatus, readonly WarrantyClaimStatus[]> = {
  REQUESTED: ["ELIGIBILITY_REVIEW"],
  ELIGIBILITY_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["TROUBLESHOOTING"],
  REJECTED: ["CLOSED"],
  TROUBLESHOOTING: ["SERVICE_REPAIR"],
  SERVICE_REPAIR: ["REPLACEMENT", "REFUND"],
  REPLACEMENT: ["COMPLETED"],
  REFUND: ["COMPLETED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
};

/** Whether `to` is a legal next status directly from `from`. No self-transitions, no skipping steps. */
export function isValidClaimTransition(
  from: WarrantyClaimStatus,
  to: WarrantyClaimStatus
): boolean {
  return CLAIM_TRANSITIONS[from].includes(to);
}

/** Every status directly reachable from `from` -- used to render "advance to" choices in the admin UI. */
export function nextValidClaimStatuses(from: WarrantyClaimStatus): readonly WarrantyClaimStatus[] {
  return CLAIM_TRANSITIONS[from];
}
