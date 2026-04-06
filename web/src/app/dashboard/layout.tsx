import { ensureProfilePhoneOrRedirect } from '@/lib/ensure-profile-phone';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await ensureProfilePhoneOrRedirect();
  return <>{children}</>;
}
