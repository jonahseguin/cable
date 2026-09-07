# cable

The project name is **cable** and the intended npm scope is `@cablejs`.
The user confirmed this name during M0; the alternatives in the design are historical.

Package identities live in their `package.json` files. A rename also updates workspace
imports, documentation, Changesets configuration, and protocol defaults deliberately.
Do not rename protocol identifiers incidentally while renaming npm packages.

Scope ownership and domain availability have not been established. Before a first
public release, verify ownership, choose the project license, remove package privacy
flags deliberately, and review the packed artifacts. M0 does not publish packages.
