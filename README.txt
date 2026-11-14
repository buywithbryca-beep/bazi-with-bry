BaZi with Bry: Netlify site folder

What is in this folder
  index.html                     the calculator page
  cities/                        the birth city lists (loaded as you type)
  vendor/                        calendar engine and PDF tools
  netlify/functions/reading.mjs  the "Write full reading" service (Claude)
  netlify.toml                   tells Netlify where things are

Two ways to put it online

1. Drag and drop (quickest)
   Everything works EXCEPT the "Write full reading" button.
   Netlify drag and drop uploads do not install functions, so the button stays hidden.

2. GitHub connected (needed for the Claude button)
   Upload this folder to a GitHub repository, then in Netlify choose
   Add new site > Import an existing project > GitHub, and pick the repository.
   Netlify reads netlify.toml and installs the function automatically.

Settings the Claude button needs (Netlify > Site configuration > Environment variables)
  ANTHROPIC_API_KEY   your key from console.anthropic.com
  BRY_PASSCODE        the passcode you type on the page to use the button
  ANTHROPIC_MODEL     optional, defaults to claude-sonnet-5
After adding or changing these, redeploy the site (Deploys > Trigger deploy).

Safety
  Never paste the API key into index.html. It only lives in Netlify's settings.
  The function limits each visitor to 20 readings per 10 minutes.
