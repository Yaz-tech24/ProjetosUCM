// Gera __tests__/fixtures/exemplo.docx — um documento Word mínimo mas válido
// (OOXML), usado pelo teste de integração da conversão com o LibreOffice.
// Corre-se uma vez (node __tests__/fixtures/gerar-docx.js); o resultado fica
// commitado para o teste não depender deste script.
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>UCM SmartHub — documento de teste</w:t></w:r></w:p>
    <w:p><w:r><w:t>Este ficheiro DOCX é convertido para PDF pelo LibreOffice em modo headless.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Cálculo integral: a derivada de x² é 2x.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

const destino = path.join(__dirname, "exemplo.docx");
const saida = fs.createWriteStream(destino);
const zip = archiver("zip", { zlib: { level: 9 } });
zip.pipe(saida);
zip.append(CONTENT_TYPES, { name: "[Content_Types].xml" });
zip.append(RELS, { name: "_rels/.rels" });
zip.append(DOCUMENT, { name: "word/document.xml" });
zip.finalize();
saida.on("close", () => console.log(`Gerado ${destino} (${fs.statSync(destino).size} bytes)`));
