# @opensheets/spread-sheets-designer-resources-it

Italian (it-IT) ribbon labels, dialog text and command titles for the OpenSheets Designer
component — our own translation, using the terminology of the Italian Microsoft Excel UI
(Home, Inserisci, Layout di pagina, Formule, Dati, Revisione, Visualizza, Impostazioni, ...).

The official SpreadJS product ships resource packages for several languages but no Italian
one, so this package has no `@mescius` twin and needs no npm alias: add it directly.

Importing the package registers the resources onto the designer; it must be loaded **after**
the designer package and **before** the `Designer` is created, so labels measured or cached at
startup (ribbon widths, adaptive layout) already use the Italian strings.

```ts
import '@opensheets/spread-sheets-designer';
import '@opensheets/spread-sheets-designer-resources-it'; // before `new GC.Spread.Sheets.Designer.Designer(...)`

const designer = new GC.Spread.Sheets.Designer.Designer(host);
```

CommonJS:

```js
require('@opensheets/spread-sheets-designer');
require('@opensheets/spread-sheets-designer-resources-it');
```

Script tag (same URL shape as the official resource packages):

```html
<script src="node_modules/@opensheets/spread-sheets/dist/gc.spread.sheets.all.min.js"></script>
<script src="node_modules/@opensheets/spread-sheets-designer/dist/gc.spread.sheets.designer.all.min.js"></script>
<script src="node_modules/@opensheets/spread-sheets-designer-resources-it/dist/gc.spread.sheets.designer.resource.it.min.js"></script>
```

English stays the default: nothing changes unless this package (or an equivalent
`setResources` call) is loaded. The key tree is identical to `englishResources`, so partial
overrides merge cleanly through `Designer.setResources`.

Licence: MIT (see `LICENSE.md`).
