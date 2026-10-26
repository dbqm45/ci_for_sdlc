import type { ClaimPackId } from '../model.js';
import { EV_CLAIM_PACK } from './claim-pack-ev.js';
import { GENERAL_CLAIM_PACK, type ClaimPack } from './claims.js';

const PACKS: Record<ClaimPackId, ClaimPack> = { general: GENERAL_CLAIM_PACK, ev: EV_CLAIM_PACK };

/** The claim pack of a project setting; unset means general. */
export const claimPackOf = (id: ClaimPackId | undefined): ClaimPack => PACKS[id ?? 'general'] ?? GENERAL_CLAIM_PACK;
