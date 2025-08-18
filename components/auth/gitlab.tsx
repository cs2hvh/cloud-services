"use client";
import { createClient } from "@/lib/supabase/client";

export default function GitLabLoginButton() {
  const handleLogin = async () => {
    //debugger
    console.log("................7");
    const supabase = createClient();
    const response = await supabase.auth.signInWithOAuth({
      provider: "gitlab",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    console.log(response.data, "................14");
  };

  return (
    <button
      onClick={handleLogin}
      className="px-4 py-2 bg-orange-600 text-white rounded"
    >
      Continue with GitLab
    </button>
  );
}
