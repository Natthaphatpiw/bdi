import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/me — right-to-erasure. Cascades all personal rows (FK on delete
// cascade) + removes Storage objects under the user's prefix.
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const admin = adminClient();

  // 1) remove storage objects (documents bucket)
  try {
    const { data: list } = await admin.storage.from("documents").list(auth.user.id);
    if (list?.length) {
      await admin.storage
        .from("documents")
        .remove(list.map((o) => `${auth.user.id}/${o.name}`));
    }
  } catch (e) {
    console.error("[me] storage cleanup:", (e as Error).message);
  }

  // 2) delete the auth user → ON DELETE CASCADE wipes profiles/sessions/messages/…
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) {
    console.error("[me] deleteUser:", error.message);
    return ERR.server("ลบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
  return ok({ deleted: true });
}
