import { db } from "../db";
/** Always resolve current database role; a browser/session claim is insufficient. */
export function isAdministrator(id: string) {
    const row = db().prepare("SELECT role,status,emailVerified FROM user WHERE id=?").get(id) as {
        role: string;
        status: string;
        emailVerified: number;
    } | undefined;
    return row?.role === "admin" && row.status === "active" && row.emailVerified === 1;
}
