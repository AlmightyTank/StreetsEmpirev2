import { staffCan, type StaffCapability, type StaffRole } from '@streets/shared';
import { useSession } from '../stores/session.js';

/**
 * The signed-in account's staff role and what it may do. Only hides what the server
 * would refuse anyway: every admin route checks the role itself.
 */
export function useStaff(): { role: StaffRole | null; can: (capability: StaffCapability) => boolean } {
  const role = useSession((s) => s.account?.staffRole ?? (s.account?.isAdmin ? 'ADMIN' : null));
  return { role, can: (capability) => staffCan(role, capability) };
}
