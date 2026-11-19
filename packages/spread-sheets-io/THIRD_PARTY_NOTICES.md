# Third-party notices

OpenSheets is original code. The items below record the open-source libraries this package
depends on and how their licences are respected.

## fflate — MIT

- **What:** the ZIP reader/writer used for the xlsx and spread-archive containers
  (`src/zip.ts`).
- **Project:** https://github.com/101arrowz/fflate
- **Copyright:** Copyright (c) 2019 Arjun Skelton
- **Licence:** MIT — https://opensource.org/license/mit

## @noble/ciphers, @noble/hashes — MIT

- **What:** AES-128/AES-256 cipher modes, HMAC-SHA1/SHA256/SHA512 and the SHA-1/SHA-256
  digests used by the encrypted-package (CDF "Agile"/"Standard") and legacy xlsx
  decrypt paths.
- **Project:** https://github.com/paulmillr/noble-ciphers, https://github.com/paulmillr/noble-hashes
- **Copyright:** Copyright (c) 2022 Paul Millar and contributors
- **Licence:** MIT — https://opensource.org/license/mit

## Format specifications

OOXML (ECMA-376), the OPC packaging convention, CSV (RFC 4180) and theOLE/CFB container
were read from the published specifications. No third-party spreadsheet implementation was
read while writing this package.
