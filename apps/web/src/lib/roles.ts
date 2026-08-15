export type AppRole = 'OWNER' | 'ADMIN' | 'RECEPTION' | 'MASTER' | 'ACCOUNTANT';

const ALL: AppRole[] = ['OWNER', 'ADMIN', 'RECEPTION', 'MASTER', 'ACCOUNTANT'];

/** Which nav items each role can see */
export const navRoles: Record<string, AppRole[]> = {
  '/dashboard': ALL,
  '/appointments': ['OWNER', 'ADMIN', 'RECEPTION', 'MASTER'],
  '/waitlist': ['OWNER', 'ADMIN', 'RECEPTION'],
  '/recurring': ['OWNER', 'ADMIN', 'RECEPTION'],
  '/clients': ['OWNER', 'ADMIN', 'RECEPTION', 'MASTER'],
  '/services': ['OWNER', 'ADMIN', 'RECEPTION'],
  '/staff': ['OWNER', 'ADMIN', 'RECEPTION', 'MASTER'],
  '/cash': ['OWNER', 'ADMIN', 'RECEPTION', 'ACCOUNTANT'],
  '/payments': ['OWNER', 'ADMIN', 'RECEPTION', 'ACCOUNTANT'],
  '/inventory': ['OWNER', 'ADMIN', 'RECEPTION'],
  '/loyalty': ['OWNER', 'ADMIN', 'RECEPTION'],
  '/reports': ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  '/settings': ['OWNER', 'ADMIN'],
};

export function canAccess(role: string | undefined, href: string) {
  if (!role) return false;
  const allowed = navRoles[href];
  if (!allowed) return true;
  return allowed.includes(role as AppRole);
}

export function isMaster(role?: string) {
  return role === 'MASTER';
}

export function canManageMoney(role?: string) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'RECEPTION' || role === 'ACCOUNTANT';
}

export function canTakePayment(role?: string) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'RECEPTION';
}
