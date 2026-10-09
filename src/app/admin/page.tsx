import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { currentUser } from "@/lib/agent/auth";
import { isAdministrator } from "@/lib/admin/access";
import { OperationsDashboard } from "@/components/admin/operations-dashboard";
export default async function AdminPage() {
    const user = await currentUser();
    if (!user)
        redirect("/login");
    if (!isAdministrator(user.id))
        notFound();
    const t = await getTranslations("operations");
    return <section className="space-y-6"><h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
    <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p><OperationsDashboard /></section>;
}
