// Defensive limits for a single estimate request. Enforced server-side in
// /api/estimate (authoritative — the client can't be trusted) and mirrored
// client-side in Home for instant feedback before a request is even sent.
// Shared here so the two can never drift apart.
export const MAX_INPUT_LEN = 300;
export const MAX_ITEMS = 10;
export const MAX_QTY_PER_ITEM = 20;
export const MAX_TOTAL_QTY = 50;
