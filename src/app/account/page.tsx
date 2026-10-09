import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";
import { AccountCenter } from "@/components/auth/account-center";
import { accountLink } from "@/lib/auth/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await currentUser())) redirect(accountLink("login", "/account"));
  return <AccountCenter />;
}
