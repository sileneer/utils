import { AccountForm } from "@/components/auth/account-form";
import { safeReturnTo } from "@/lib/auth/navigation";
export default async function Page({ searchParams }: {
  searchParams: Promise<{ returnTo?: string; reauth?: string }>;
}) {
  const { returnTo, reauth } = await searchParams;
  return <AccountForm mode="login" returnTo={safeReturnTo(returnTo)} reauth={reauth === "1"} />;
}
