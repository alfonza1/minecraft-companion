# Release and static deployment

The public site builds independently with `npm run build:website` into
apps/website/dist. All eight pages are prerendered, with local fonts, metadata,
sitemap and no runtime API client. No paid backend is required. Deploy only that
directory, never the repository root or application data directory.

WAYPOINT_SITE_BASE defaults to /minecraft-companion/ and WAYPOINT_SITE_ORIGIN
to https://alfonza1.github.io. Set both at build time for another host. The build
works as static files on GitHub Pages or a comparable host.

## Maintainer checklist

1. Review the complete diff, dependency advisories, license inventory and source/history secrets.
2. Run npm test, npm run typecheck, npm run build, npm run build:website, npm run test:website.
3. Run npm run evaluate; publish only reviewed synthetic results explicitly.
4. Run npm run release:check. Inspect release/dependency-licenses.json.
5. Update CHANGELOG and package version. Commit only scoped source.
6. Run npm run release:package from a clean tree. Inspect source ZIP and SHA256SUMS.
7. Publish a prerelease with the source archive, checksum and accurate limitations.
8. Enable GitHub Pages with the workflow deployment source; review the site URL.

The CI workflow builds on supported Node versions and runs regression checks.
The Pages workflow publishes only the static artifact. Source ZIPs contain no
node_modules, game binaries, speech models, auth cache or database. Optional skins
submodule is not embedded. A release ZIP still needs Node/Git and installation;
it is not a signed standalone desktop binary.

Do not silently change repository visibility or default branch while deploying.
Do not claim CI or a release succeeded until the remote run/artifact is verified.

