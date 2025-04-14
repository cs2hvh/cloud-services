import querystring from 'querystring';

const {
    DISCORD_CLIENT_ID,
    DOMAIN,
} = process.env;

if (!DISCORD_CLIENT_ID || !DOMAIN) {
    throw new Error("Missing required environment variables.");
}

const scope = [
    'identify',
    'email',
    'guilds',
    'guilds.members.read'
].join(' ');

const params = querystring.stringify({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DOMAIN + "/api/auth/discord",
    response_type: 'code',
    scope,
});

const OAuthUrl = `https://discord.com/oauth2/authorize?${params}`;

export const discord = {
    OAuthUrl
}