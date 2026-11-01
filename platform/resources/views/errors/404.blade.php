<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Page not found — WOODEX</title>
    <meta name="description" content="This address is not on the WOODEX site. The shop, the services and the projects are one click away.">
    <meta name="robots" content="noindex, follow">
    <style>
        :root { color-scheme: light; --ink: #111; --muted: #6b6b6b; --line: rgba(17, 17, 17, .14); --paper: #fbfaf7; }
        * { box-sizing: border-box; }
        body {
            margin: 0; min-height: 100vh; display: grid; place-items: center;
            padding: 40px 20px; background: var(--paper); color: var(--ink);
            font-family: "Inter", "Helvetica Neue", Arial, sans-serif; line-height: 1.6;
        }
        main { width: min(760px, 100%); }
        .brand { font-size: .8rem; letter-spacing: .34em; font-weight: 700; text-transform: uppercase; }
        .code { margin: 40px 0 0; font-size: clamp(5rem, 18vw, 11rem); line-height: .8; letter-spacing: -.06em; font-weight: 600; color: var(--ink); }
        h1 { margin: 24px 0 12px; font-size: clamp(1.6rem, 4vw, 2.4rem); line-height: 1.15; letter-spacing: -.03em; font-weight: 600; }
        p { margin: 0 0 8px; color: var(--muted); max-width: 52ch; }
        nav { margin-top: 36px; display: flex; flex-wrap: wrap; gap: 10px; }
        nav a {
            display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px;
            border: 1px solid var(--line); border-radius: 999px; text-decoration: none;
            color: var(--ink); font-size: .9375rem; transition: background .2s, border-color .2s;
        }
        nav a:hover { background: #fff; border-color: var(--ink); }
        nav a.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
        footer { margin-top: 56px; padding-top: 18px; border-top: 1px solid var(--line); font-size: .8125rem; color: var(--muted); }
        footer a { color: var(--ink); }
    </style>
</head>
<body>
<main>
    <div class="brand">WOODEX</div>

    <p class="code">404</p>
    <h1>This address is not on the site.</h1>
    <p>It may have moved, or the link that brought you here may be out of date — a lot of the older
        interior pages now live on the furniture site.</p>

    <nav>
        <a class="primary" href="/shop">Shop office furniture</a>
        <a href="/services">Services</a>
        <a href="/projects">Projects</a>
        <a href="/blog">Journal</a>
        <a href="/contact">Contact</a>
    </nav>

    <footer>
        WOODEX — office furniture and interiors, Lahore.
        @auth
            <a href="/admin">Back to the panel</a>
        @else
            <a href="/">Home page</a>
        @endauth
    </footer>
</main>
</body>
</html>
