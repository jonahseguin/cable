# diff-viewer

Tiny Hono app for browsing a `git diff` patch file by file.

## Usage

```sh
cd scripts/debug/diff-viewer
pnpm install

# from a patch file
node server.js my.patch

# from a git range (runs `git diff <range>` in cwd)
node server.js abc123..HEAD
node server.js main..HEAD

# from a repo dir (HEAD vs working tree)
node server.js /path/to/repo

# custom port
node server.js main..HEAD --port 4000
```

Then open http://localhost:3737.
