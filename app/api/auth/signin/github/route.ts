import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

const SUPPORTED_PROVIDERS = ["github", "google", "gitlab", "bitbucket"] as const;
type OAuthProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

const PROVIDER_OAUTH_OPTIONS: Record<
  OAuthProvider,
  {
    scopes?: string;
    queryParams?: Record<string, string>;
  }
> = {
  github: {
    scopes: "repo user:email",
  },
  google: {
    queryParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
  gitlab: {
    scopes: "read_user read_repository write_repository api read_api",
  },
  bitbucket: {
    scopes: "repository account",
  },
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      next?: string;
    };
    const provider = typeof body.type === "string" ? body.type.toLowerCase() : "github";
    const next = body.next;

    if (!isOAuthProvider(provider)) {
      return Response.json({ message: "Unsupported OAuth provider" }, { status: 400 });
    }

    const origin = request.headers.get("origin") || "http://localhost:3000";
    // Validate next to prevent open redirect
    const safeNext = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const providerOptions = PROVIDER_OAUTH_OPTIONS[provider];
    const options: {
      redirectTo: string;
      scopes?: string;
      queryParams?: Record<string, string>;
    } = {
      redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(safeNext)}`,
    };

    if (providerOptions.scopes) {
      options.scopes = providerOptions.scopes;
    }

    if (providerOptions.queryParams) {
      options.queryParams = providerOptions.queryParams;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });

    //checking if user has enabled 2FA-auth or not
    // const response = await supabase.auth.mfa.listFactors();
    // const has2FA = response?.data?.totp.some(
    //   (factor) => factor.status === "verified",
    // );

    // console.log(has2FA, ".........................23");

    // if (has2FA) {
    //   return Response.json(
    //     { url: data.url, enabled2fa: true },
    //     { status: 200 },
    //   );
    // }

    // console.log(data, "..............data............17");

    if (error) {
      logError("auth/signin/github", error);
      return Response.json({ message: sanitizeAuthError(error) }, { status: 400 });
    }

    if (!data.url) {
      return Response.json(
        { message: "Failed to generate OAuth URL" },
        { status: 500 },
      );
    }

    console.log(`[OAuth] Redirect URL generated for ${provider}`);

    return Response.json({ url: data.url }, { status: 200 });
  } catch (error) {
    console.error("[Route] OAuth signin error:", error);
    return Response.json(
      { message: "Something went wrong :(" },
      { status: 500 },
    );
  }
}
