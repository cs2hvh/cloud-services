import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import bcryptjs from "bcryptjs";
import query from "@/lib/db/mysql";
import { lucia } from "@/lib/lucia/auth";
import db from "@/lib/db/mysql/lib";

export async function POST(request: NextRequest) {
    const { email, password } = await request.json();

    if (!email || !password) {
        return Response.json({ message: "Not found" }, { status: 404 });
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(/, /)[0];
    const user_agent = request.headers.get("user-agent");

    const user_exists = await query.users.get_by_email(email);

    if (!user_exists) {
        return Response.json({ message: "User does not exist" }, { status: 404 });
    }

    const valid_pass = await bcryptjs.compare(password, user_exists.password);

    if (!valid_pass) {
        return Response.json(
            { message: "Invalid username or password" },
            { status: 403 }
        );
    }

    const session = await lucia.createSession(user_exists.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    const cookieStore = await cookies();
    cookieStore.set(
        sessionCookie.name,
        sessionCookie.value,
        sessionCookie.attributes
    );
    await db.query(
        "UPDATE sessions SET user_agent = ?, ip = ? WHERE id = ?;",
        [user_agent, ip, session.id]
    );

    return Response.json({
        message: "Signed in successfully.",
        name: user_exists.username,
    });
}
