// Minimal GitHub OAuth for Decap CMS on Netlify Functions (no external deps)
// Full debug version for testing token exchange and message passing

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
  const path = url.pathname;
  const code = url.searchParams.get("code");
  const redirectUri = `${SITE_ORIGIN}/api/auth/callback`;

  // 1) Start OAuth -> redirect to GitHub
  if (path.endsWith("/auth") && !path.endsWith("/auth/callback")) {
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
  if (path.endsWith("/auth/callback")) {
    if (!code) {
      return html("<p>Missing OAuth code.</p>");
    }

    const res = await fetch(GITHUB_TOKEN, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
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

    // 3) Debug version – display token and manual send buttons
    return html(`<!doctype html>
<html><body>
  <h3>GitHub OAuth success</h3>
  <p><strong>Origin detected:</strong> ${SITE_ORIGIN}</p>
  <p><strong>Token (first 6 chars):</strong> ${data.access_token.slice(0,6)}…</p>
  <p>This page won't auto-close. Use the buttons below to send the token to the opener (Decap CMS).</p>
  <button id="send-exact">Send to opener (exact origin)</button>
  <button id="send-any">Send to opener (any origin)</button>
  <button id="close">Close window</button>
  <pre id="log" style="background:#f6f6f6;padding:8px;border:1px solid #ddd;"></pre>
<script>
  (function() {
    var payload = 'authorization:github:success:' + JSON.stringify({ token: '${data.access_token}' });
    function log(msg){ 
      var el = document.getElementById('log'); 
      el.textContent += (msg + "\\n"); 
    }

    document.getElementById('send-exact').onclick = function() {
      try {
        if (window.opener) {
          window.opener.postMessage(payload, '${SITE_ORIGIN}');
          log('postMessage sent to ${SITE_ORIGIN}');
        } else {
          log('No opener window found');
        }
      } catch(e) { log('Error: ' + e.message); }
    };

    document.getElementById('send-any').onclick = function() {
      try {
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          log('postMessage sent to *');
        } else {
          log('No opener window found');
        }
      } catch(e) { log('Error: ' + e.message); }
    };

    document.getElementById('close').onclick = function(){ window.close(); };
  })();
</script>
</body></html>`);
  }

  // 4) Fallback – unknown route
  return { statusCode: 404, body: "Not found" };
};
