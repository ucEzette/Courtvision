export const onRequest: PagesFunction = async (context) => {
  const { request, next } = context;
  const url = new URL(request.url);
  const cookieHeader = request.headers.get("Cookie") || "";
  const hasAccess = cookieHeader.includes("courtvision_access=FENAN2026");

  // Allow static assets, API calls (though API should ideally be protected), and auth POST
  const isAsset = url.pathname.includes(".") || url.pathname.startsWith("/assets/");
  const isAuthPost = request.method === "POST" && url.pathname === "/_auth";
  const isOptions = request.method === "OPTIONS";

  if (hasAccess || isAsset || isAuthPost || isOptions) {
    if (isAuthPost) {
      const formData = await request.formData();
      const code = formData.get("code");
      if (code === "FENAN2026") {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": "/",
            "Set-Cookie": "courtvision_access=FENAN2026; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000",
          }
        });
      } else {
        return new Response("Invalid Code", { status: 401 });
      }
    }
    return next();
  }

  // Beautiful Access Required Page
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Courtvision | Private Access</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Outfit:wght@700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #050505;
            --accent-color: #00ffd5;
            --secondary-accent: #0099ff;
            --text-primary: #ffffff;
            --text-secondary: #a0a0a0;
        }

        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
        }

        .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 3rem;
            border-radius: 2rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            max-width: 400px;
            width: 90%;
            animation: fadeIn 0.8s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .logo {
            font-family: 'Outfit', sans-serif;
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: var(--accent-color);
        }

        h1 {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
            line-height: 1.2;
        }

        p {
            color: var(--text-secondary);
            font-size: 0.875rem;
            margin-bottom: 2rem;
        }

        form {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        input {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 1rem 1.5rem;
            border-radius: 1rem;
            color: #fff;
            font-size: 1rem;
            text-align: center;
            letter-spacing: 2px;
            transition: all 0.3s;
            outline: none;
        }

        input:focus {
            border-color: var(--accent-color);
            background: rgba(255, 255, 255, 0.08);
            box-shadow: 0 0 15px rgba(0, 255, 213, 0.2);
        }

        button {
            background: var(--accent-color);
            border: none;
            padding: 1rem;
            border-radius: 1rem;
            color: #000;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px -10px var(--accent-color);
            filter: brightness(1.1);
        }

        .footer {
            margin-top: 2rem;
            font-size: 0.75rem;
            color: rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Courtvision</div>
        <h1>Private Beta</h1>
        <p>This application is currently in closed testing. Please enter your secret tester code to continue.</p>
        
        <form action="/_auth" method="POST">
            <input type="password" name="code" placeholder="ENTER ACCESS CODE" required autofocus autocomplete="off">
            <button type="submit">Unlock Access</button>
        </form>

        <div class="footer">Locked for Secure Evaluation Only</div>
    </div>
</body>
</html>
  `;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=UTF-8" }
  });
};
