// Minimal GitHub OAuth for Decap CMS on Netlify Functions (no external deps)

const SITE_ORIGIN = process.env.SITE_ORIGIN || "https://beasts-and-bytes-00.netlify.app";
const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const GITHUB_AUTH = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

function html(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body
  };
}

exports.handler = async (event) => {
  const url = new URL(event.rawUrl);
  const path = url.pathname; // /.netlify/functions/auth
  const isCallback = url.pathname.endsWith("/auth") && url.searchParams.get("callback") === "1";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectUri = `${SITE_ORIGIN}/api/auth/callback`;

  // 1) Start OAuth -> redirect to GitHub
  if (url.pathname.endsWith("/auth") && !isCallback) {
    const authURL = new URL(GITHUB_AUTH);
    authURL.searchParams.set("client_id", CLIENT_ID);
    authURL.searchParams.set("redirect_uri", redirectUri);
    authURL.searchParams.set("scope", "repo,user:email");
    authURL.searchParams.set("state", Math.random().toString(36).slice(2));
    return {
      statusCode: 302,
      headers: { Location: authURL.toString() }
    };
  }

  // 2) Callback -> exchange code for token
  if (isCallback || url.pathname.endsWith("/auth/callback")) {
    if (!code) {
      return html(`<p>Missing OAuth code.</p>`);
    }
    const res = await fetch(GITHUB_TOKEN, {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: redirectUri
      })
    });
    const data = await res.json();
    if (!data.access_token) {
      return html(`<p>OAuth Error: ${JSON.stringify(data)}</p>`);
    }

    // 3) Hand token back to Decap CMS (postMessage to opener)
    const safeOrigin = SITE_ORIGIN;
    const token = data.access_token;
    return html(`<!doctype html>
<html><body>
<script>
  (function() {
    function send() {
var payload = 'authorization:github:success:' + JSON.stringify({token: '${token}'});
// TEMP: send to any origin to debug origin mismatches
try {
  if (window.opener) {
    window.opener.postMessage(payload, '*');
    // small delay so we see something if it fails to close
    setTimeout(() => window.close(), 250);
  } else {
    document.body.innerText = 'Login successful. You can close this window.';
  }
} catch (e) {
  document.body.innerText = 'PostMessage error: ' + (e && e.message ? e.message : e);
}

    }
    send();
  })();
</script>
</body></html>`);
  }

  // Fallback
  return { statusCode: 404, body: "Not found" };
};
