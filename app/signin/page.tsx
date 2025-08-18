import { SignInForm } from "@/components/auth/signin";
import { getUser } from "@/lib/supabase/auth";
import Image from "next/image";
import { redirect } from "next/navigation";

export default async function SignInPage() {

    const user = await getUser();

    if (user) {
        redirect("/")
    }

    return (
        <div className="relative min-h-svh w-full overflow-hidden">
            {/* Background Image */}
            <div className="absolute inset-0">
                <Image
                    src="https://samatva.blr1.cdn.digitaloceanspaces.com/images/rp1.jpg"
                    alt="Background"
                    fill
                    priority
                    className="object-cover"
                    sizes="100vw"
                />
                <div className="absolute inset-0" />
            </div>

            {/* Content */}
            <div className="relative z-10 flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-sm rounded-xl backdrop-blur-md shadow-2xl md:max-w-3xl">
                    <SignInForm />
                </div>
            </div>
        </div>
    );
}