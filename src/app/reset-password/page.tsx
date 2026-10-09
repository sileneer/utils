import { AccountForm } from "@/components/auth/account-form";
import { safeReturnTo } from "@/lib/auth/navigation";
export default async function Page({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return <AccountForm mode="reset" returnTo={safeReturnTo(returnTo)} />;
}
