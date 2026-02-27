
==> Deploying...
==> Setting WEB_CONCURRENCY=1 by default, based on available CPUs in the instance
==> Running 'node server.js'
node:internal/modules/cjs/loader:1458
  throw err;
  ^
Error: Cannot find module './db'
Require stack:
- /opt/render/project/src/server.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1455:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1065:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1070:22)
Menu
    at Module._load (node:internal/modules/cjs/loader:1241:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1555:12)
    at require (node:internal/modules/helpers:190:16)
    at Object.<anonymous> (/opt/render/project/src/server.js:8:17)
    at Module._compile (node:internal/modules/cjs/loader:1811:14)
    at Object..js (node:internal/modules/cjs/loader:1951:10) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/opt/render/project/src/server.js' ]
}
Node.js v25.7.0
==> Exited with status 1
==> Common ways to troubleshoot your deploy: https://render.com/docs/troubleshooting-deploys
==> Running 'node server.js'
node:internal/modules/cjs/loader:1458
  throw err;
  ^
Error: Cannot find module './db'
Require stack:
- /opt/render/project/src/server.js
    at Module._resolveFilename (node:internal/modules/cjs/loader:1455:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1065:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1070:22)
    at Module._load (node:internal/modules/cjs/loader:1241:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1555:12)
    at require (node:internal/modules/helpers:190:16)
    at Object.<anonymous> (/opt/render/project/src/server.js:8:17)
    at Module._compile (node:internal/modules/cjs/loader:1811:14)
    at Object..js (node:internal/modules/cjs/loader:1951:10) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [ '/opt/render/project/src/server.js' ]
}
Node.js v25.7.0
