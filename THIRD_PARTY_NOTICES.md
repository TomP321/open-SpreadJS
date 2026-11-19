# Third-party notices

OpenSheets is original code. The items below record data or reference material that came from
third-party open-source projects, with their licences.

## ZXing ("Zebra Crossing") — Apache License 2.0

- **What:** the PDF417 codeword-to-bar/space pattern table (three clusters of 929 values) and the
  start/stop guard patterns in `packages/spread-sheets/src/features/barcode-pdf417-tables.ts`.
  The values are defined by ISO/IEC 15438 (Table 4); the numeric encoding used here matches the
  table published in ZXing (`com.google.zxing.pdf417.PDF417Common` / `encoder.PDF417`).
- **Project:** https://github.com/zxing/zxing
- **Copyright:** Copyright (C) 2006-2024 ZXing authors
- **Licence:** Apache License, Version 2.0 — https://www.apache.org/licenses/LICENSE-2.0

  Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
  in compliance with the License. Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
  CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language
  governing permissions and limitations under the License.

The barcode encoders themselves (Code 39/93/128, GS1-128, Codabar, EAN, QR, Data Matrix, PDF417
high-level encoding, Reed-Solomon, symbol placement) are written in this repository from the public
symbology specifications. During development ZXing (Apache-2.0), bwip-js (MIT) and JsBarcode (MIT)
were consulted as references and a local ZXing-based reader was used to verify readability.
