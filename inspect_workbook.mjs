import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from '@oai/artifact-tool';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(new URL('./sources/attachments/miliastra_simulation_v0_6.xlsx',import.meta.url).pathname.replace(/^\/(.:)/,'$1')));
const summary=await wb.inspect({kind:'workbook,sheet,table',maxChars:18000,tableMaxRows:4,tableMaxCols:7,tableMaxCellChars:120});
await fs.writeFile(new URL('./evidence/workbook-inspect.ndjson',import.meta.url),summary.ndjson);
console.log(summary.ndjson);
