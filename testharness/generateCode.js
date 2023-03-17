const fs = require('fs');
const fse = require('fs-extra'); // Add this line to require fs-extra
const { ModelManager } = require('@accordproject/concerto-core');
const { FileWriter } = require('@accordproject/concerto-util');
const Visitor = require('../lib/codegen/fromcto/rust/rustvisitor');

async function main() {
  try {
    const modelFilePath = process.argv[2];
    if (!modelFilePath) { // ensure model file path is provided
      console.log('Usage: node generateCode.js <model-filename> <output-directory>');
      process.exit(1);
    }
    const model = fs.readFileSync(modelFilePath, 'utf8');
    const mm = new ModelManager();

    mm.addCTOModel(model, modelFilePath, true);  // true to disable consistency checks on imports
    await mm.updateExternalModels(); // await the asynchronous call

    let outputFilePath = process.argv[3];
    if (!outputFilePath) {  // ensure output file path is provided
      console.log('Usage: node generateCode.js <model-filename> <output-directory>');
      process.exit(1);
    };
    if (!outputFilePath.endsWith('/')) {  // ensure output file path ends with '/'
      outputFilePath += '/';
    };

    // Empty the output directory before generating code
    fse.emptyDirSync(outputFilePath);

    const parameters = {
      fileWriter: new FileWriter(outputFilePath)
    };
    const visitor = new Visitor();

    mm.accept(visitor, parameters);
    console.log('Code generation complete. Output files are in ' + outputFilePath + '.');

  }
  catch (err) {
    console.log(err)
  }
}

main();